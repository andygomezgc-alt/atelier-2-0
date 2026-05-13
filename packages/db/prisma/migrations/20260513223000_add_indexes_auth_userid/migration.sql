-- Adds indexes on Account.userId and Session.userId for NextAuth-style joins.
-- These tables grow with every login/sign-up; without the index, lookups by
-- userId scan the whole table. The index is small (just userId) and CREATE
-- INDEX is fast on the current row counts.

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
