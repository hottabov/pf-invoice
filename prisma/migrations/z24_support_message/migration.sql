-- A message sent from Settings -> PathQuote Support to whoever holds the
-- DEVELOPER role (z23_developer_role) -- see the SupportMessage model's own
-- comment in schema.prisma for why it's kept this small and why it's always
-- written before an email send is attempted.
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" "Role" NOT NULL,
    "regionId" TEXT,
    "appVersion" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMessage_authorId_idx" ON "SupportMessage"("authorId");

-- AddForeignKey
-- Restrict, matching Document.authorId (0_init): a user with a support
-- message on record can't be hard-deleted out from under it. Nothing in
-- this app hard-deletes a User today (see User.active instead), so this
-- can't fire in practice -- consistency with the existing author-FK
-- convention matters more than a rule this schema will actually exercise.
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, unlike Document.regionId's RESTRICT: a support message is a
-- point-in-time report, not a live commercial document -- losing its region
-- context to a future region deletion is acceptable, and nothing should
-- block that deletion on this table's account.
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
