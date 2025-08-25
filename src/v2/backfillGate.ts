// V2 server-truth gating for Backfill logic
// Currently re-exports v1 functionality until refactored

export { detectBackfillStatus } from '@/lib/backfillDetection';
export type { BackfillStatus } from '@/lib/backfillDetection';