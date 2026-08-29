# Operations Runbook

PathQuote deploys from `main` to a single VPS via GitHub Actions
(`.github/workflows/deploy.yml`). The app runs under Docker Compose
(`docker compose`) as three services — `app`, `postgres`, `gotenberg` — with
`app` bound to `127.0.0.1:3010` and Nginx reverse-proxying the public domain
`q.pathfindercut.com` in front of it.

## 1. One-time VPS setup

Run once, on a fresh VPS with Docker, Docker Compose, git, and Nginx already
installed.

1. Clone the repo to the path the deploy workflow expects:

   ```bash
   git clone git@github.com:hottabov/pf-invoice.git /opt/pathquote
   cd /opt/pathquote
   ```

   The deploy job runs `git pull --ff-only` from this exact path, so it must
   be `/opt/pathquote` and the working tree must stay on `main` with no local
   commits ahead of origin.

2. Create the environment file from the template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   - `AUTH_SECRET` — generate with `openssl rand -base64 32`.
   - `POSTGRES_PASSWORD` — a strong random password; must match the password
     portion of `DATABASE_URL`.
   - `DATABASE_URL` — `postgresql://pathquote:<POSTGRES_PASSWORD>@postgres:5432/pathquote`
     (the `postgres` host is the Compose service name, not `localhost`).
   - `AUTH_URL` — `https://q.pathfindercut.com`.
   - `SMTP_*` / `EMAIL_FROM` — for magic-link email. Leaving `SMTP_*` blank
     disables magic-link login; password login is unaffected.
   - `GOTENBERG_URL` — `http://gotenberg:3000` (leave as-is; matches the
     Compose service name).
   - `UPLOADS_DIR` — `/data/uploads` (matches the `uploads` volume mount).

   `.env` is git-ignored and never leaves the VPS.

3. Build and start the stack:

   ```bash
   docker compose up -d --build
   ```

4. Apply migrations:

   ```bash
   docker compose run --rm tools npx prisma migrate deploy
   ```

5. Seed the catalog (idempotent — safe to re-run):

   ```bash
   docker compose run --rm tools npm run db:seed
   ```

6. Create the first admin user. Prefer piping the password in rather than
   typing it as a plain CLI argument — anything passed as an argv token is
   written to the shell's history file (`~/.bash_history` etc.) and is
   visible to any other process on the box via `/proc/<pid>/cmdline` while it
   runs. Two safer options, both using the existing
   `npm run user:create -- <email> <password> ADMIN AU` script:

   - **Environment variable, unset immediately after:**

     ```bash
     read -rs ADMIN_PW && echo
     docker compose run --rm -e ADMIN_PW tools sh -c \
       'npm run user:create -- you@example.com "$ADMIN_PW" ADMIN AU'
     unset ADMIN_PW
     ```

   - **Interactive shell inside the container**, typing the password at a
     prompt so it never appears in either host or container shell history:

     ```bash
     docker compose run --rm tools sh
     # inside the container:
     npm run user:create -- you@example.com "$(read -rsp 'password: ' p && echo "$p")" ADMIN AU
     exit
     ```

   Either way, clear your host shell history afterwards if the password did
   end up on the command line (`history -d <line>` or `history -c`).

7. Verify: `curl -fsS http://127.0.0.1:3010/api/health` should return
   `{"ok":true}`, and `https://q.pathfindercut.com/login` should load once
   Nginx and TLS are configured (section 3).

## 2. GitHub repository secrets

Add these under **Settings → Secrets and variables → Actions** on
`github.com/hottabov/pf-invoice`. The `deploy` job in
`.github/workflows/deploy.yml` reads them via `appleboy/ssh-action@v1`.

| Secret        | Value                                                          |
| ------------- | --------------------------------------------------------------- |
| `VPS_HOST`    | VPS hostname or IP                                              |
| `VPS_USER`    | SSH user with access to `/opt/pathquote` and the `docker` group |
| `VPS_SSH_KEY` | Private key for a **dedicated deploy key**                      |

For `VPS_SSH_KEY`, generate a dedicated keypair rather than reusing a
personal key (`ssh-keygen -t ed25519 -f deploy_key -N ""`), add the public
half to the VPS user's `~/.ssh/authorized_keys`, and paste the private half
into the secret. Since the workflow only needs `git pull` (read access) plus
local Docker/Prisma commands already on the box, the corresponding GitHub
deploy key (if you also register the public key as a repo Deploy Key rather
than relying on an already-cloned repo with its own remote credentials)
only needs **read access** — do not grant it write/push access.

## 3. Nginx + TLS

Create `/etc/nginx/sites-available/pathquote`:

```nginx
server {
    listen 80;
    server_name q.pathfindercut.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/pathquote /etc/nginx/sites-enabled/pathquote
nginx -t && systemctl reload nginx
```

Then obtain a certificate with certbot (adds the TLS `server` block and the
HTTP→HTTPS redirect automatically):

```bash
certbot --nginx -d q.pathfindercut.com
```

Certbot's systemd timer renews automatically; confirm it's active with
`systemctl status certbot.timer`.

## 4. Backups

### Nightly dump

Add to the deploy user's crontab (`crontab -e`):

```cron
0 3 * * * mkdir -p /opt/backups && docker compose -f /opt/pathquote/docker-compose.yml exec -T postgres pg_dump -U pathquote pathquote | gzip > /opt/backups/pq-$(date +\%F).sql.gz
```

### 14-day rotation

Add a second cron entry to prune anything older than 14 days:

```cron
30 3 * * * find /opt/backups -name 'pq-*.sql.gz' -mtime +14 -delete
```

(The `\%F` escaping above is required because `%` is special to cron; when
editing the crontab directly via `crontab -e` the same escaping applies.)

### Restore procedure

1. Stop the app so it isn't writing during restore (Postgres can stay up):

   ```bash
   docker compose stop app
   ```

2. Restore from a chosen dump:

   ```bash
   gunzip -c /opt/backups/pq-2026-08-29.sql.gz | \
     docker compose exec -T postgres psql -U pathquote -d pathquote
   ```

   Restoring into a database with existing tables can conflict; for a clean
   restore, drop and recreate the database first (destructive — confirm you
   have the dump you want):

   ```bash
   docker compose exec -T postgres psql -U pathquote -d postgres -c \
     "DROP DATABASE pathquote; CREATE DATABASE pathquote OWNER pathquote;"
   gunzip -c /opt/backups/pq-2026-08-29.sql.gz | \
     docker compose exec -T postgres psql -U pathquote -d pathquote
   ```

3. Bring the app back up and re-verify migrations are in sync (Prisma
   tracks applied migrations in the restored dump, so this should be a
   no-op if the dump matches the current schema):

   ```bash
   docker compose up -d app
   docker compose run --rm tools npx prisma migrate deploy
   curl -fsS http://127.0.0.1:3010/api/health
   ```

## 5. Troubleshooting

**App won't respond / health check failing**

```bash
curl -fsS http://127.0.0.1:3010/api/health   # {"ok":true} expected
docker compose ps                             # all services should be "healthy"/"running"
docker compose logs -f app                    # tail app logs
docker compose logs -f postgres               # tail Postgres logs
docker compose logs -f gotenberg              # tail Gotenberg logs
```

The `/api/health` route runs `SELECT 1` against Postgres on every request
(it is never cached), so a `503` there almost always means the database is
unreachable or `DATABASE_URL` in `.env` is wrong — check `docker compose
logs postgres` and confirm the app's `.env` matches the Postgres container's
credentials.

**Migrations out of sync**

```bash
docker compose run --rm tools npx prisma migrate status
```

Shows pending/failed migrations. To re-apply cleanly:

```bash
docker compose run --rm tools npx prisma migrate deploy
```

If a migration is reported as failed partway through, resolve it manually
per the Prisma CLI's guidance (`prisma migrate resolve`) before retrying —
do not re-run `migrate deploy` blindly against a half-applied migration.

**Deploy workflow fails at the SSH step**

- Confirm `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` secrets are current and the
  public key is still in `~/.ssh/authorized_keys` on the VPS.
- Confirm `/opt/pathquote` has no local commits/changes blocking
  `git pull --ff-only` (`git status` on the VPS).

**Deploy workflow fails at `docker compose run --rm tools npx prisma migrate
deploy` or the final `curl` health check**

- SSH in and repeat the same commands manually (`docker compose run --rm
  tools npx prisma migrate deploy`, then `curl -fsS
  http://127.0.0.1:3010/api/health`) to see the actual error before deciding
  whether to roll back.
- `docker compose logs app` for the stack trace.

**Rolling back a bad deploy**

```bash
cd /opt/pathquote
git log --oneline -5      # find the last good commit
git checkout <good-sha>
docker compose up -d --build
docker compose run --rm tools npx prisma migrate deploy
curl -fsS http://127.0.0.1:3010/api/health
```

Return to `main` (`git checkout main`) once a fix is pushed, so the next
automated deploy's `git pull --ff-only` succeeds.
