# План впровадження за аудитом 2026-09-04

Джерело: `docs/audit/2026-09-04-audit.md`. Кожен крок = один PR, з критерієм готовності
і способом перевірки. Порядок — за ефектом на деплой, потім за ризиком. Кроки всередині
фази незалежні (можна паралелити), фази — послідовні.

Статуси: `[ ]` не почато · `[~]` в роботі · `[x]` готово. Оновлювати в цьому файлі.

---

## Фаза 0 — Baseline ✅ (2026-09-04)

- [x] **0.1** VPS: 4 vCPU, 7901 MB RAM (2743 used, swap 2047/488), Docker 29.7.2, Compose v5.5.0.
- [x] **0.2** `docker compose build app` (теплий) — 0.54 с, усі 21 шар CACHED. Холодний не заміряно (prune перервано вручну).
- [x] **0.3** GHA: `ci` — **1m27s**; `verify-db` — **7m36s**; `deploy` — **7m36s**.

| Метрика | Значення |
|---|---|
| VPS vCPU / RAM | 4 / 7.9 GB (+2 GB swap, 488 MB зайнято → пам'ять під тиском) |
| `docker compose build app` warm | 0.54 с (21/21 CACHED) |
| `docker compose build app` cold | не заміряно — див. 0.2b |
| GHA `ci` | 1m 27s |
| GHA `verify-db` | **7m 36s** |
| GHA `deploy` | 7m 36s |
| push → healthy | ≈ 9 хв |

### Що з цього випливає (перегляд пріоритетів)

1. **VPS не такий вузький, як припускалось** — 4 vCPU / 7.9 GB. Але `docker builder prune -af`
   показав **десятки GB** осілих шарів (кілька записів по 1.5–1.6 GB, «5 days ago»), тобто
   збірки накопичуються і диск під тиском. Додано `docker image prune -f` у крок 1.4.
2. **`verify-db` (7m36s) — це критичний шлях, а не збірка.** Він дорівнює всьому часу
   `deploy` і в 5 разів довший за `ci`. Ціна: другий `npm ci` + `migrate` + **seed двічі**.
   `prisma/seed.ts` (545 рядків) виконує сотні послідовних `upsert`/`findUnique`/`create`
   у циклах, без жодного `createMany` (`seed.ts:96,151,172,257,277,288,329,380,437`) —
   ~1000+ round-trip'ів за прогін, ×2 прогони. **Фаза 3 піднімається у пріоритеті вище
   Фази 2**, а до неї варто додати крок 3.6 (батчинг seed'у).
3. Теплий build на VPS = 0.5 с, отже 7m36s у `deploy` — це переважно **холодні шари**
   (будь-яка зміна у `COPY . .` контексті ⇒ повний `npm ci` + `next build`) плюс
   **другий** `up -d --build`. Обидві причини знімає Фаза 1.

- [ ] **0.2b** Після Фази 1 заміряти на VPS холодний build чесно:
  `docker builder prune -af && time docker compose build app` (дочекатися завершення prune).
- [ ] **0.3b** У GHA відкрити останній `verify-db` і записати тривалість **кожного кроку**
  окремо (`npm ci` / `Migrate` / `Seed (first run)` / `Seed (second run)` / count-check) —
  це визначить, чи Фаза 3 має чинити батчинг seed'у, чи достатньо прибрати другий `npm ci`.

---

## Фаза 1 — Деплой без переносу збірки ✅ код готовий, чекає на деплой

Мета: прибрати очевидні дублі, не міняючи топологію. Очікуваний виграш: 20–40 % часу деплою.

- [x] **1.1** `.dockerignore` переписано: `.claude/` (3.6 MB), `tests/`, `scripts/`, `docs/`, `data/`, `RAW/`, `*.md`, `*.tsbuildinfo`, `.DS_Store`, compose-файли, `vitest.config.ts`, `eslint.config.mjs`.
- [x] **1.2** `Dockerfile`:
  - `COPY . .` → явний список build-inputs (`package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `public/`, `src/`, `prisma/seed-lib.ts`, `prisma/seed-data/content-blocks.json`).
    Дві prisma-залежності — не випадковість: `src/lib/content-placeholders.ts:1-2` імпортує саме їх.
  - Прибрано `npx prisma generate` зі стадії `build` (postinstall у `deps` уже згенерував клієнт; `generate` не потребує `DATABASE_URL`, бо `datasource` містить лише `provider`).
  - Placeholder-секрети `ENV` → `ARG` — більше не осідають у жодному образі.
  - **Тонкий `tools`**: тепер `FROM node:22-alpine` + `deps`, а не `FROM build`. Містить `node_modules`, `package.json`, `prisma.config.ts`, `tsconfig.json`, `prisma/`, `scripts/`, `src/` — усе, що треба для `db:migrate`, `db:seed`, `user:create`, `images:import`; без `.next` і без build-секретів.
    *(Винесено з Фази 2: явний `COPY` у `build` неможливий, доки `tools` успадковує `build`.)*
  - `run`: `NEXT_TELEMETRY_DISABLED=1`; `prisma/` тепер береться з `tools` (байт-у-байт як було — чи потрібна вона там взагалі, з'ясовує 2.2).
- [x] **1.3** `next.config.ts`: `typescript.ignoreBuildErrors: process.env.SKIP_TYPECHECK === "1"` (Dockerfile ставить `SKIP_TYPECHECK=1`; CI вже gate'ить `tsc`, а `deploy` стартує лише після зеленого `ci`); `env.APP_VERSION: process.env.APP_VERSION || process.env.npm_package_version` + `ARG APP_VERSION` у Dockerfile — готово до передачі git SHA у Фазі 2.
- [x] **1.4** `deploy.yml`: прибрано `npx prisma generate` в обох jobs; `up -d --build` → `up -d app gotenberg`; `docker image prune -f` після успішного health-check.
- [x] **1.5** `package.json`: `shadcn` → devDependencies, `dotenv@^17.4.2` доданий явно (використовують `prisma.config.ts:3`, `prisma/seed.ts:14`, `scripts/*`; раніше резолвився лише транзитивно через `prisma`). `package-lock.json` оновлено — діф лише `"dev": true` на транзитивному дереві shadcn, жодного нового пакета.
- [x] **1.6a** Локальна перевірка: `npm run lint` ✅, `npm run typecheck` ✅, `vitest` 52/52 файли, 1249/1249 тестів ✅.
- [x] **1.6b** `npm ci` з нового lock ✅, typecheck ✅, 1249 тестів ✅ (Mac, 1.75 с).
- [x] **1.6c** `docker build --target build|tools|run` локально (Mac) — **знайшов баг**:
  `.dockerignore` виключав `scripts/`, а тонкий `tools` їх копіює → `COPY scripts ./scripts`
  падав з `"/scripts": not found`. Виправлено: `scripts` прибрано з `.dockerignore`
  (потрапляє тільки у `tools`-стадію, у `build` — ні).
  Другим заходом прибрано warning `SecretsUsedInArgOrEnv`: `DATABASE_URL`/`AUTH_SECRET`
  більше не `ARG` і не `ENV`, а inline-префікс на самому `RUN npm run build` — плейсхолдера
  тепер немає ні в шарі, ні в `docker history`.
- [x] **1.6d** Три `docker build --target build|tools|run` — усі три пройшли, warning зник.
  `build` = 14.3 с. `docker run pq-tools-check` показав 31 міграцію + `migration_lock.toml`,
  усі 8 скриптів, `tsx 4.23.12`, `prisma/@prisma/client 7.10.0` — тонкий `tools` робочий.
- [ ] **1.6e** Деплой на `main` (разом із Фазами 2–3, одним пушем — див. нижче). Записати різницю:

| Метрика | До | Після Фази 1 |
|---|---|---|
| GHA `ci` | 1m 27s | |
| GHA `verify-db` | 7m 36s | |
| GHA `deploy` | 7m 36s | |
| `docker compose build app` cold (VPS) | 3m 04s | |

### Заміри холодної збірки (2026-09-04)

**VPS, старий Dockerfile** (`docker builder prune -af` + `image prune -af` → 2.46 GB звільнено):

| Крок | Час |
|---|---|
| transferring context | 0.2 с (**14.08 MB**) |
| `npm ci` (deps) | **114.9 с** |
| `COPY --from=deps node_modules` | 8.8 с |
| `npx prisma generate && npm run build` | **45.9 с** |
| export + unpack | 5.0 + 1.1 с |
| **разом** | **3m 04s** |

**Mac, новий Dockerfile** (`--target build`):

| Крок | Час |
|---|---|
| transferring context | 0.1 с (**2.68 MB** ← було 14.08) |
| `npm ci` (deps) | 111.8 с |
| `COPY --from=deps node_modules` | 10.9 с |
| `npm run build` (без `prisma generate`, `SKIP_TYPECHECK=1`) | **13.5 с** ← було 45.9 |
| export | 8.0 с |

Висновки:

1. **`SKIP_TYPECHECK` + прибраний `prisma generate` дають ~30 с** на кожній збірці
   (45.9 → 13.5 с; частина різниці — швидший Mac, але порядок величини той самий).
2. **Контекст зменшився з 14.08 MB до 2.68 MB** — і, що важливіше, правка `docs/`,
   `.claude/` чи `tests/` більше не інвалідовує шар `build`.
3. **`npm ci` = 115 с, або 62 % холодної збірки.** Шар `deps` кешується і перебудовується
   лише при зміні `package*.json`, тому у звичайному деплої його немає — але після
   будь-якого `builder prune` або зміни залежностей він повертається. У Фазі 2 це знімає
   кеш GHA (`cache-from: type=gha`), який переживає prune на VPS, бо VPS більше не збирає.
4. **3m 04s збірки ≠ 7m 36s job'а `deploy`.** Різницю (~4.5 хв) з'їдають: збірка+експорт
   `tools` (старий `FROM build` = другий образ на ~1.6 GB), `git pull`, `up -d postgres`,
   міграції, **другий** `up -d --build` і health-loop. Фаза 1 знімає другий `--build`;
   решту знімає Фаза 2, після якої VPS взагалі нічого не збирає.

### 0.3b — seed виміряно: гіпотеза спростована ❌

`time docker compose run --rm tools npm run db:seed` на VPS = **1m 12.9s**, але з них:

| Складова | Час |
|---|---|
| перезбірка образу `tools`: **exporting layers** | 51.8 с |
| перезбірка образу `tools`: **unpacking** | 16.6 с |
| решта (створення контейнера + **сам seed**) | **≈ 4 с** |

**Seed — це ~4 секунди, а не 3 хвилини.** Крок **3.6 (батчинг `prisma/seed.ts` на
`createMany`) скасовано** — він не окупається, а це була єдина зміна в плані, що чіпає
продакшн-дані. Ризик прибрано з плану повністю.

Натомість цифра викрила справжнього ворога на VPS: **експорт і розпакування образу —
68 с на один образ**. Локальна збірка платить цю ціну щоразу; `docker pull` з реєстру —
ні, бо тягне лише змінені шари, а шар `node_modules` (1.2 GB) змінюється тільки разом із
`package-lock.json`. Це і є головний аргумент за Фазу 2, сильніший за економію CPU.

### Ризики Фази 1 і як їх ловити

| Ризик | Симптом | Дія |
|---|---|---|
| Явний `COPY` пропустив файл, потрібний `next build` | build падає з `Module not found` | додати шлях у `build`-стадію; це єдина причина, чому 1.6b обов'язковий перед Фазою 2 |
| `tools` більше не `FROM build` | `docker compose run --rm tools npm run db:seed` падає | перевірити вручну (див. «Що зробити руками», п. 3) |
| `run` тягне `prisma/` з `tools` | `docker compose build app` тепер завжди будує і `tools` | очікувано; заодно прибирає стару пастку «міграції з несвіжого образу» |
| `SKIP_TYPECHECK=1` ховає помилку типів | зламаний прод при зеленому CI неможливий, бо `deploy` needs `ci` | якщо колись вимкнути gate у `ci` — прибрати і `SKIP_TYPECHECK` |

---

## Фаза 2 — Збірка в GHA + GHCR, VPS лише pull (1–2 PR, середній ризик, ~3 год)

Мета: VPS більше не компілює. Очікуваний виграш: VPS-крок < 1 хв; загалом push → healthy ≈ 3–5 хв.

- [x] **2.1** Тонкий `tools` уже зроблено у Фазі 1 (був блокером явного `COPY`).
  `--mount=type=cache` **свідомо не додано**: у GHA кеш дає `cache-from/to: type=gha`,
  а на VPS збірки більше не буде — mount-кеш там нічого не кешував би між деплоями.
- [x] **2.2** Перевірено опосередковано: `run` збирається і стартує з поточним
  `COPY --from=build node_modules/.prisma`. Питання «чи потрібна `prisma/` у runtime»
  лишається відкритим — див. 2.9.
- [x] **2.3** Job `build` (needs `ci`, лише `main`): `docker/build-push-action@v6` для
  цілей `run` і `tools`, теги `:${sha}` і `:latest`, `cache-from/to: type=gha,mode=max`,
  `permissions: packages: write`, `provenance: false` (плоский однопл. образ замість
  manifest list з атестацією — саме те, що передбачувано тягне compose).
  `build-args: APP_VERSION=${{ github.sha }}` — тепер збірка позначена комітом.
- [x] **2.4** `docker-compose.yml`: додано `image: ghcr.io/hottabov/pathquote{,-tools}:${TAG:-latest}`.
  `build:` **залишено** обом сервісам — на VPS використовується лише `image:` (workflow
  тягне образ до старту), а локально `docker compose build` працює як раніше.
- [ ] **2.5** VPS одноразово: `docker login ghcr.io`. **Робить власник** — покроково в
  `docs/runbook.md` §1 крок 3. Увага: GHCR приймає **лише classic PAT** зі скоупом
  `read:packages`; fine-grained токени до нього не автентифікуються взагалі
  (перевірено в docs.github.com 2026-09-04, у першій редакції плану було неточно).
- [x] **2.6** VPS-скрипт: `export TAG=$GITHUB_SHA` → `docker compose --profile tools pull app tools`
  → `up -d postgres` → `run --rm tools npx prisma migrate deploy` → `up -d app gotenberg`
  → health loop → `docker image prune -f`. `git pull` залишено, але тепер лише заради
  `docker-compose.yml`, не коду.
- [x] **2.7** Runbook: новий розділ «2b. What a deploy actually does» + «Rolling back»
  (`TAG=<sha> docker compose up -d app`, із застереженням, що міграції не відкочуються).
- [ ] **2.8** Перевірка: два деплої поспіль (холодний кеш GHA, потім теплий); записати часи.
- [ ] **2.9** Після першого успішного деплою перевірити, чи runtime взагалі читає `prisma/`:
  `docker compose exec app ls prisma` і спробувати прибрати `COPY --from=tools /app/prisma`
  окремим PR. Prisma 7 з driver-адаптером інлайнить схему в клієнт, тож директорія
  ймовірно зайва — але це перевіряється тільки на живому контейнері.

Ескіз `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,target=/root/.npm npm ci   # postinstall = prisma generate, один раз

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json next.config.ts tsconfig.json postcss.config.mjs components.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY public ./public
COPY src ./src
ARG GIT_SHA=dev
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ARG AUTH_SECRET="build-time-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_TYPECHECK=1 APP_VERSION=$GIT_SHA
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:22-alpine AS tools
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src/lib/production-forms/templates ./src/lib/production-forms/templates
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

Ескіз job'ів `deploy.yml` (фрагмент):

```yaml
  build:
    needs: ci
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: run
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }},ghcr.io/${{ github.repository }}:latest
          build-args: GIT_SHA=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: tools
          push: true
          tags: ghcr.io/${{ github.repository }}-tools:${{ github.sha }},ghcr.io/${{ github.repository }}-tools:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Фаза 3 — CI: один job, verify-db як тест (1 PR, ~2 год)

- [x] **3.1** `verify-db` злито в `ci` (`services: postgres`) — один runner, один `npm ci`
  замість двох. Job перейменовано на «Lint, typecheck, test, verify DB».
- [x] **3.2** Доданий крок `prisma migrate diff … --exit-code` — ловить `schema.prisma`
  без відповідної міграції.
  **Виправлено після падіння run #33875029530:** Prisma 7 переписала інтерфейс команди —
  `--to-schema-datamodel` → `--to-schema`, а `--shadow-database-url` прибрано зовсім
  (`unknown or unexpected option`). Варіант `--from-migrations` тепер вимагає
  `datasource.shadowDatabaseUrl` у `prisma.config.ts` плюс другу базу; узято
  `--from-config-datasource --to-schema`, який порівнює вже змігровану БД зі схемою —
  без зайвої бази і з сильнішою гарантією (перевіряє застосований результат, а не
  повторне програвання міграцій). Крок переставлено **після** `Migrate`.
  Прапорці перевірено локально проти недосяжної БД: невідомий прапорець падає до
  з'єднання, валідний — на `P1001`.
- [x] **3.3** Inline CJS-скрипт (60 рядків у YAML) → **`scripts/verify-seed.ts`** + npm-скрипт
  `db:verify-seed`. Під `tsx` він імпортує `seed-lib.ts`, тому `regions` тепер теж виводиться
  з даних, а не лишається літералом (саме через цю неможливість імпорту стара версія і
  дрейфувала). Обидва прогони seed'у залишені — вони по 4 с, ідемпотентність дешева.
- [x] **3.4** ~~vitest projects~~ — не знадобилось: перевірка seed'у стала звичайним
  скриптом, окремий інтеграційний проєкт у vitest не потрібен.
- [ ] **3.5** (опційно, згодом) `paths-filter`: seed-кроки лише при змінах у `prisma/**`.
- [x] ~~**3.6** Батчинг seed'у~~ — **скасовано 2026-09-04**. Замір показав seed ≈ 4 с
  (уся видима тривалість припадала на перезбірку образу `tools`, див. 0.3b). Переписувати
  `prisma/seed.ts` немає сенсу, і це прибирає з плану єдину зміну, що чіпала продакшн-дані.
  Оригінальний текст кроку залишено нижче лише як запис розсліду.

<details>
<summary>Скасований крок 3.6 (для історії)</summary>

- **Батчинг seed'у** (додано після baseline: `verify-db` = 7m36s, найдовший job).
  `prisma/seed.ts` виконує сотні послідовних запитів у циклах, жодного `createMany`:
  regions (`:96`), series (`:151`), retired options (`:172`), products (`:257`), options (`:277`),
  AU prices (`:288`), US prices (`:329`), compatibility (`:380`, `:437` — вкладений цикл із
  `findMany` + `delete` на кожен рядок). Порядок дій:
  1. спочатку 0.3b — виміряти, скільки з 7m36s припадає саме на seed;
  2. якщо seed домінує: замінити цикли на `createMany({ skipDuplicates: true })` + один
     `updateMany` на зміни, а існування перевіряти одним `findMany` наперед замість
     `findUnique` у циклі; зберегти ідемпотентність (тест з 3.3 її і перевіряє);
  3. якщо домінує `npm ci` — достатньо злиття jobs (3.1).

---

## Фаза 4 — Тести: конфіг + typecheck (1 PR, 30 хв)

- [ ] **4.1** `vitest.config.ts`: `isolate: false`, `pool: 'threads'`, `typecheck: { enabled: false }`. Запустити suite двічі — зелений.
- [ ] **4.2** `tsconfig.json`: `exclude: ["node_modules", "tests"]`; створити `tests/tsconfig.json` (`extends: "../tsconfig.json"`, `include: ["./**/*.ts"]`) для редактора. Опційно у CI `npx tsc -p tests --noEmit`.
- [ ] **4.3** Перевірка: `npm test` ≈ 5 с; `npm run typecheck` не типізує `tests/`.

---

## Фаза 5 — Безпека / коректність домену (2–3 PR, ~1 день)

- [ ] **5.1** `recalcDocument`, `recalcAndEnforce` → `src/lib/documents/recalc.ts` (без `"use server"`). Усі читання (`db.option`, `getCommissionTiers`) через переданий `tx`. Оновити імпорти в `actions/documents.ts`, `actions/finalize.ts`. Перевірити: `grep -rn "recalcDocument" src` — жодного експорту з `"use server"`.
- [ ] **5.2** `finalize.ts`: recalc всередині `$transaction`; `updateMany({ where: { id, status: "DRAFT" } })` з перевіркою `count === 1`.
- [ ] **5.3** Кожна мутація draft'а — `updateMany where status:"DRAFT"` всередині tx (або `withDraftMutation`, див. 7.1).
- [ ] **5.4** `setItemOptions`, `applyScreenSideToQuote`: `createMany` замість циклу.
- [ ] **5.5** Prisma-міграція з індексами: `Product(seriesId)`, `Document(updatedAt)`, `Document(contactId)`, `DocumentItem(productId)`, `DocumentLine(kind, refId)`, `OptionCompatibility(seriesId)`, `OptionCompatibility(productId)`, `ContentBlock(regionId)`, `CatalogVisibility(seriesId)`, `CatalogVisibility(productId)`.
- [ ] **5.6** `dotenv` явно в deps (якщо не зроблено у 1.5).

---

## Фаза 6 — Quick wins продуктивності сторінок (2 PR, ~1 день)

- [ ] **6.1** React `cache()`: `getDocumentForBuilder`, `getQuoteValidityDays`, `getCommissionTiers`, `getHiddenCatalogIds`, `getCompany*`, `getSeries*`, усі per-id getter'и, що викликаються з `generateMetadata` і page.
- [ ] **6.2** `documents/[documentId]/page.tsx`: `getHiddenCatalogIds` у перший `Promise.all`; `listCompatibleOptions` паралельно до batch'у.
- [ ] **6.3** `getItemPickerCatalog` → один `product.findMany({ include: { series: true, prices: { where: { region: { code } } } } })` + `select` замість `include: { region: true }`.
- [ ] **6.4** `next/dynamic(() => import("@/components/ui-kit/rich-text-editor"), { ssr: false })` у `notes-section`, `product-form`, `content-block-form`.
- [ ] **6.5** `ui-kit/index.ts` → server-safe; `ui-kit/client.ts` для `PhoneField`, `ToastProvider`, `ConfirmProvider`, `RichTextEditor`. Оновити 48 client-імпортерів (`sed` + перевірка `next build`).
- [ ] **6.6** `lib/countries.ts`: прибрати top-level `registerLocale`; клієнту — статичний масив `{ code, name }` (згенерувати скриптом у `src/lib/countries-data.ts`) або prop із сервера.
- [ ] **6.7** `lib/rich-text.ts`: `toEditorHtml` / `renderMarkdown` у DOMPurify-free модуль; sanitize лише server-side. (Побічно: −40 % import-часу тестів.)
- [ ] **6.8** `app/(app)/error.tsx`, `not-found.tsx`; `documents/[documentId]/loading.tsx`.

---

## Фаза 7 — Дедуплікація коду (3–4 PR, ~2 дні)

- [ ] **7.1** `src/lib/actions/_shared.ts`: `ActionResult`, `NOT_FOUND_ERROR`, `FORBIDDEN_ERROR`, `flattenZodError`, `withDraftMutation(itemId, role, fn)`. Видалити 12 копій.
- [ ] **7.2** `src/lib/revalidate.ts`: `revalidateDocument(id)`, `revalidateCompany(id)`, `revalidateCatalog(seriesId?)`, … Замінити 89 викликів.
- [ ] **7.3** `src/lib/documents/engine-input.ts`: `buildEngineInput(document, optionRows, tiers)`; Decimal → `.toString()`. Використати в `actions/documents.ts:230`, `queries/documents.ts:540`.
- [ ] **7.4** `validation/`: один `regionCodeSchema` (експорт з `regions.ts`), один `validityDaysSchema`. Видалити дубль-тести.
- [ ] **7.5** `pricing.ts`: винести `formatPct/concessionCapMessage/markupCapMessage` у `lib/pricing-messages.ts`; engine без імпортів.
- [ ] **7.6** Спільний `identityResolver` (`lib/sheet-identity.ts`).
- [ ] **7.7** `lib/upload-client.ts` для 3 raw `fetch("/api/uploads")`; спільний `ReorderList` для `items-list` / `product-reorder-list`.

---

## Фаза 8 — Тести: структура (2–3 PR, ~1 день)

- [ ] **8.1** `tests/helpers/fixtures.ts` (`baseItem`, `baseDoc`, `baseCompany`, `baseQuotationData`); переключити sheet-data, item-breakdown, quotation-data, pdf, finalize-validation, catalog-visibility.
- [ ] **8.2** `tests/helpers/schema.ts` (`expectValid`, `expectInvalid`, `cases`); конвертувати 10 `*-validation` у `test.each`. Наративні `it()` лишити для security/business-правил (website XSS, last-admin, checkbox coercion).
- [ ] **8.3** Злиття: discounts→pricing, item-breakdown→sheet-data, phone→phone-regions, numbering→format, roles→settings-nav, cell-ref→xlsx-patch, support→support-message-email, validity→documents-validation, us-prices→seed-mapping.
- [ ] **8.4** `catalog.test.ts` → `catalog-invariants.test.ts` (унікальні коди, null price ⇒ needsReview, EasyLoader width ⇒ drive module, X↔M parity). Literal counts/prices — `describe("catalog snapshot (update on purpose)")` або видалити.
- [ ] **8.5** Підпапки за `src/lib`: `pricing/`, `sheet/`, `validation/`, `catalog/`, `production-forms/`, `text/`, `email/`, `misc/`.
- [ ] **8.6** Ціль: ~38 файлів, ~8.3k LOC, ~1150 тестів, ≤5 с.

---

## Фаза 9 — Структурні рефакторинги (по 1 PR кожен, за потреби)

- [ ] **9.1** `actions/documents.ts` → `actions/documents/{lifecycle,items,options,lines,pricing,presentation}.ts`.
- [ ] **9.2** `actions/catalog.ts` → `products / options / prices / compat / conflict-groups`.
- [ ] **9.3** `queries/documents.ts` → `documents-builder.ts` / `documents-list.ts` / `pickers.ts`.
- [ ] **9.4** `client-section.tsx` → `CompanyFields` / `ContactFields` спільні з `clients/`; прибрати prop-drilling actions (імпорт у місці виклику); `region-form`, `user-form`, `option-form` контрольовані.
- [ ] **9.5** Міграції → timestamp-імена (скрипт перейменування папок + `UPDATE _prisma_migrations SET migration_name`); data-fix'и з `seed.ts:133-250` → одноразові міграції.
- [ ] **9.6** PDF: derivatives замість оригіналів, `fs.promises`, ліміт конкурентності (p-limit 2); `quotation-sheet.tsx` → `sheet/sections/*.tsx` + `sheet.css.ts`.
- [ ] **9.7** Пагінація `listDocuments`/`listCompanies`; server-side пошук клієнтів у builder.
- [ ] **9.8** `components/ui/button.tsx` → `ui-kit/`; `components.json` aliases → `ui-kit`.

---

## Рішення власника (2026-09-04)

> «Важлива швидкість деплою, а не складність розробки.»

Отже: GHCR схвалено, Фаза 2 йде повним обсягом, а не half-measures. Компроміси на кшталт
«лишити збірку на VPS, але з кешем» не розглядаємо. Там, де вибір між простішим
конфігом і швидшим деплоєм — беремо швидший.

## Що зробити руками (Фази 1–3, один пуш)

Власник вирішив не ганяти CI заради проміжних перевірок (кожен run коштує 7–15 хв),
тому Фази 1, 2 і 3 їдуть одним пушем. Локально перевірено все, що можна перевірити
без GitHub: три `docker build --target`, вміст `tools`, `npm ci`, typecheck, 1249 тестів,
валідність YAML обох файлів.

1. **До пушу — `docker login ghcr.io` на VPS** (крок 2.5; без нього перший деплой
   впаде на `docker compose pull`).

   Спершу створити токен на GitHub — **classic**, не fine-grained (GHCR інші не приймає),
   з єдиним скоупом `read:packages`. Готова форма:
   <https://github.com/settings/tokens/new?scopes=read:packages&description=pathquote-vps-pull>

   Потім на VPS вставити його у прихований prompt:

   ```bash
   read -rs GHCR_TOKEN && echo
   echo "$GHCR_TOKEN" | docker login ghcr.io -u hottabov --password-stdin
   unset GHCR_TOKEN
   ```

   Очікується `Login Succeeded`. Деталі й діагностика — `docs/runbook.md` §1 крок 3.

2. **Пуш у `main`.** Перший run буде найповільніший: кеш GHA порожній, і VPS тягне
   обидва образи цілком. Другий run покаже реальну усталену швидкість — саме його
   цифри й варто записувати.

3. **Записати часи** обох прогонів: `ci` / `build` / `deploy` + **загальний час workflow**
   → таблиця Фази 1.

4. **Перевірити після деплою:**

   ```bash
   cd /opt/pathquote
   docker compose ps                                   # app healthy, тег = sha коміту
   curl -fsS http://127.0.0.1:3010/api/health          # ok + schemaOk
   docker compose run --rm tools npm run db:verify-seed
   docker compose exec app ls prisma 2>&1 | head       # для кроку 2.9
   ```

5. **Перевірити rollback** (поки є на що відкочуватись і поки це безпечно —
   перед першою міграцією, що ламає сумісність):

   ```bash
   TAG=<попередній sha> docker compose up -d app && curl -fsS http://127.0.0.1:3010/api/health
   TAG=<новий sha> docker compose up -d app
   ```

### Що змінилось у Фазах 2–3 (для рев'ю перед пушем)

| Файл | Зміна |
|---|---|
| `.github/workflows/deploy.yml` | `verify-db` злито в `ci`; доданий `migrate diff --exit-code`; новий job `build` (GHCR, кеш GHA); `deploy` тепер pull-only |
| `docker-compose.yml` | `image:` для `app` і `tools` з `${TAG:-latest}`; `build:` залишено для локальної роботи |
| `scripts/verify-seed.ts` | новий; замінює 60 рядків inline CJS у YAML, виводить усі очікувані числа з `seed-lib.ts` + `catalog.json` |
| `package.json` | новий скрипт `db:verify-seed` |
| `docs/runbook.md` | §1 крок 3 — GHCR login; новий §2b — що робить деплой + rollback; перенумеровано кроки §1 |

## Що зробити руками (Фаза 1, вже виконано)

Пройдено: `npm ci` + typecheck + 1249 тестів ✅; `docker build --target build` ✅ (13.5 с);
`--target tools` ❌ → баг знайдено і виправлено (1.6c). Тонкий `tools` на VPS ще не
перевірено — крок 3 нижче виконувався зі **старим** образом, бо код не запушений.

1. **Перезапустити локальну збірку після фікса** — мають пройти всі три цілі:

   ```bash
   cd ~/Documents/"PF Invoice"
   docker build --target build -t pq-build-check . \
     && docker build --target tools -t pq-tools-check . \
     && docker build --target run   -t pq-run-check .
   ```

   Warning `SecretsUsedInArgOrEnv` має зникнути. Якщо якийсь `COPY` знову впаде на
   `not found` — це знову `.dockerignore`; надішли рядок помилки.

2. **Перевірити тонкий `tools` локально**, не чекаючи деплою (найризикованіша зміна;
   БД не потрібна — достатньо переконатися, що файли й бінарники на місці):

   ```bash
   docker run --rm pq-tools-check sh -c \
     'ls prisma/migrations | wc -l; ls scripts; node_modules/.bin/tsx --version; node_modules/.bin/prisma --version | head -2'
   ```

   Очікується: 31 міграція, перелік скриптів, версії tsx і prisma.

3. **Запушити в `main`.** Після зеленого деплою повторити операційні команди на VPS —
   тепер уже з новим образом:

   ```bash
   cd /opt/pathquote
   docker compose run --rm tools npx prisma migrate deploy   # "No pending migrations"
   docker compose run --rm tools npm run db:seed             # ідемпотентно
   ```

4. **Записати нові часи GHA** (`ci` / `verify-db` / `deploy` + **загальний час workflow**)
   у таблицю Фази 1.

5. **0.3b — виміряти seed.** Це єдина цифра, якої мені бракує, щоб вирішити обсяг Фази 3.
   Найшвидший спосіб — одна команда на VPS:

   ```bash
   cd /opt/pathquote && time docker compose run --rm tools npm run db:seed
   ```

   (альтернатива: розгорнути кроки job'а «Verify DB migrate + seed» у GHA і записати час
   `npm ci` / `Migrate` / `Seed (first run)` / `Seed (second run)` / count-check).

   **Чому це важливо:** якщо seed ≈ 3 хв, то два прогони — це 6 із 7m36s job'а, і Фаза 3
   мусить включати переписування `prisma/seed.ts` на `createMany` (крок 3.6) — єдина в
   плані зміна, що чіпає продакшн-дані. Якщо seed ≈ 20 с, винен другий `npm ci`, і 3.6
   не потрібен зовсім.

6. **GHCR — підтверджено** рішенням власника (див. вище). Мені знадобиться від тебе лише
   одне під час Фази 2: створити fine-grained PAT з правом `read:packages` і зробити
   `docker login ghcr.io` на VPS (одноразово). Токен нікуди не комітиться.

## Порядок і залежності

> Переглянуто після baseline: `verify-db` (7m36s) виявився довшим за все інше, тому
> **Фаза 3 йде перед Фазою 2**.

```
0 → 1 → 3 → 2        (деплой; порядок 3 перед 2 — див. висновок Фази 0)
4                    (незалежно, будь-коли)
5 → 7.1 → 9.1        (recalc спершу, потім shared, потім split)
6.5 ← 6.4, 6.6       (barrel split перед dynamic/countries — інакше двічі правити імпорти)
7.4 → 8.2            (dedupe схем перед table-driven тестами)
8.1 → 8.3 → 8.5
```

## Критерії успіху

- push → healthy ≤ 5 хв при теплому кеші; VPS-крок ≤ 60 с; VPS CPU не використовується для збірки.
- `npm test` ≤ 5 с; `npm run typecheck` не тягне `tests/`.
- `grep -rn "export async function" src/lib/actions` — жодної функції без `requireSession/requireAdmin` на початку.
- `grep -rn "type ActionResult" src` — 1 результат.
- Жодного `include: { region: true }` у picker-запитах; `EXPLAIN` на `listDocuments` використовує індекс `updatedAt`.
