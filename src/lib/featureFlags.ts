export const isV2 =
  (import.meta.env.VITE_V2?.toLowerCase?.() === 'true') || true; // default on

// If/when you want to flip it via env:
// VITE_V2=true  -> V2 on
// VITE_V2=false -> V2 off