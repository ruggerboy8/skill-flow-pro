# Testing Supabase-backed code

*Added 2026-08-18 as part of TST-5.*

Most of this codebase talks to Supabase directly, and until now nothing that
touched the database could be unit tested — there was no way to hand it fake
data. `src/test/supabaseMock.ts` fixes that for tests: it is a fake stand-in
for the Supabase client that you load up with canned answers ("when this
table gets queried, return these rows") before calling the code under test.

## How it's wired in

- `vitest.config.ts` loads `src/test/setup.ts` before every test file.
- `setup.ts` swaps the real `supabase` export from
  `@/integrations/supabase/client` for the fake one, and clears out any
  queued responses after each test.
- Because that swap happens globally, a test file doesn't need to do
  anything special to get the fake client — it just imports and calls the
  function it's testing, and queues responses first.

## Writing a test

```ts
import { queueTable } from '@/test/supabaseMock';

it('does the thing', async () => {
  queueTable('locations', { data: { id: '1', name: 'Alcan North' }, error: null });

  const result = await someFunctionThatQueriesLocations('1');

  expect(result).toEqual(/* ... */);
});
```

`queueTable(table, response)` and `queueRpc(name, response)` both accept
`{ data, error }` (matching what the real Supabase client returns) and can be
called more than once per table/RPC to queue up answers for multiple calls,
first-in-first-out.

`getTableCalls(table)` and `getRpcCalls(name)` return what was actually
asked for — useful for asserting a function queried the right table with the
right filters, without caring what it got back.

See the example test at `src/lib/locationState.test.ts` for a full worked
example, and the header comment at the top of `src/test/supabaseMock.ts` for
exactly what the fake does and does not do.

## What this does not do

The fake is a recorder with canned responses, not a database. It does not
filter, sort, or join — `.eq('id', '1')` is recorded so a test can check it
happened, but it has no effect on what gets returned. If a test needs "only
the row where id = 1," it must queue up that already-filtered row itself.

`.auth`, `.storage`, and realtime (`.channel`) are not stubbed. Add them if a
test actually needs them.

A green test proves the function's logic is correct given the inputs it was
handed. It does not prove the underlying query is valid against the real
schema — a test can pass while the real query selects a column that doesn't
exist. Standing up a real (non-production) Supabase project to close that gap
is separate, larger work, tracked as its own item.
