-- DropIndex
DROP INDEX "Chart_isPinned_idx";

-- AlterTable
ALTER TABLE "Chart" ADD COLUMN     "layoutSpan" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Chart_isPinned_pinnedOrder_idx" ON "Chart"("isPinned", "pinnedOrder");
