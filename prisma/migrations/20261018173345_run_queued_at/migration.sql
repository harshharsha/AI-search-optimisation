-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "queuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Run_status_queuedAt_idx" ON "Run"("status", "queuedAt");
