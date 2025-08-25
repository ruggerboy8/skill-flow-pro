// DEPRECATED: Now uses server-side RPC in Layout component
// This hook is kept for compatibility but should not be used
export function useBackfillStatus() {
  console.warn('useBackfillStatus is deprecated. Use server-side RPC in Layout instead.');
  return { isBackfillComplete: true };
}