// Vitest setup file (wired in via `setupFiles` in vitest.config.ts).
//
// Replaces the real Supabase client with the fake one from supabaseMock.ts
// for every test in the suite, so any file under test that imports
// `supabase` from '@/integrations/supabase/client' gets the recorder
// instead of a real network client. Tests configure what it returns with
// `queueTable` / `queueRpc` from '@/test/supabaseMock'.
//
// Auth, storage, and realtime are intentionally not stubbed here — see the
// header comment in supabaseMock.ts for why.

import { afterEach, vi } from 'vitest';
import { supabaseMock, resetSupabaseMock } from './supabaseMock';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

afterEach(() => {
  resetSupabaseMock();
});
