-- Add username (nullable first so the backfill can populate it)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill from the email local-part, lowercased (admin@... -> admin, ealflm@... -> ealflm)
UPDATE "User" SET "username" = lower(split_part("email", '@', 1));

-- Enforce presence + uniqueness now that every row has a value
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Drop the old email identifier
DROP INDEX "User_email_key";
ALTER TABLE "User" DROP COLUMN "email";
