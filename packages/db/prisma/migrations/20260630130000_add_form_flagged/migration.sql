-- Spam / duplicate marker for lead submissions.
-- Flagged rows are hidden from the admin inbox and can be bulk-cleared.
ALTER TABLE "FormSubmission" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "FormSubmission_flagged_createdAt_idx" ON "FormSubmission"("flagged", "createdAt");
