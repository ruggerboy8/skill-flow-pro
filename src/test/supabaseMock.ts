// WHAT THIS IS
// -------------
// A test double for the Supabase client (`@/integrations/supabase/client`).
// It is a RECORDER WITH CANNED RESPONSES: a test tells it "when someone
// queries the `locations` table, hand back this row," the code under test
// runs its normal `supabase.from('locations').select('*').eq(...)` chain,
// and the double hands back whatever was queued. Every call is also
// recorded so a test can assert which table was queried and with what
// filters.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// -----------------------------------
// - It does NOT filter, sort, join, or otherwise evaluate query modifiers
//   like `.eq()`, `.order()`, or `.or()` against real data. Calling
//   `.eq('id', locationId)` is recorded (so a test can assert it happened),
//   but it has no effect on what gets returned. If a test needs "only the
//   row where id = X," it must queue up that already-filtered row itself.
//   Building something that actually evaluates `.eq()` against in-memory
//   rows is a database, and that is out of scope on purpose — see
//   docs/specs/tst-5-supabase-test-double.md.
// - It does NOT stub `.auth`, `.storage`, or `.channel` (realtime). Those
//   are out of scope for this ticket. Add them later if a test needs them.
// - It is not a substitute for testing against a real schema. A test using
//   this double can pass even if the real query selects a column that does
//   not exist in production. It only proves the function's logic is correct
//   given the inputs it is handed.
//
// HOW TO USE IT
// -------------
//   import { queueTable, queueRpc, getTableCalls } from '@/test/supabaseMock';
//
//   it('does the thing', async () => {
//     queueTable('locations', { data: { id: '1', name: 'Alcan North' }, error: null });
//     const result = await someFunctionThatQueriesLocations('1');
//     expect(result).toEqual(...);
//     expect(getTableCalls('locations')[0].filters).toContainEqual({ op: 'eq', args: ['id', '1'] });
//   });
//
// The fake client itself is wired in automatically for every test via
// `src/test/setup.ts` (registered as vitest's `setupFiles`), so most tests
// only ever need `queueTable` / `queueRpc`. Queued responses and recorded
// calls are cleared after every test automatically.

export interface MockResponse<T = unknown> {
  data: T | null;
  error: unknown | null;
  count?: number | null;
}

export interface RecordedFilter {
  op: string;
  args: unknown[];
}

export interface RecordedCall {
  table: string;
  method: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null;
  columns?: string;
  payload?: unknown;
  filters: RecordedFilter[];
  terminal: 'single' | 'maybeSingle' | null;
}

export interface RecordedRpcCall {
  name: string;
  args: unknown;
}

// ---------------------------------------------------------------------------
// Internal state — one set of queues/logs shared by every `supabase.from()`
// or `supabase.rpc()` call made during a test.
// ---------------------------------------------------------------------------

const tableQueues = new Map<string, MockResponse[]>();
const rpcQueues = new Map<string, MockResponse[]>();
const tableCalls = new Map<string, RecordedCall[]>();
const rpcCalls = new Map<string, RecordedRpcCall[]>();

function dequeue(queue: Map<string, MockResponse[]>, key: string, kind: 'table' | 'rpc'): MockResponse {
  const responses = queue.get(key);
  const next = responses?.shift();
  if (!next) {
    throw new Error(
      `supabaseMock: no canned response queued for ${kind} "${key}". ` +
        `Call ${kind === 'table' ? `queueTable('${key}', { data, error })` : `queueRpc('${key}', { data, error })`} ` +
        `before the code under test queries it.`
    );
  }
  return next;
}

/**
 * Queue a canned response for the next call to `supabase.from(table)...`.
 * Call it more than once to queue multiple responses in order — the first
 * queued response is used by the first call, the second by the second call,
 * and so on.
 */
export function queueTable(table: string, response: MockResponse): void {
  const queue = tableQueues.get(table) ?? [];
  queue.push(response);
  tableQueues.set(table, queue);
}

/**
 * Queue a canned response for the next call to `supabase.rpc(name)`.
 * Same first-in-first-out behavior as `queueTable`.
 */
export function queueRpc(name: string, response: MockResponse): void {
  const queue = rpcQueues.get(name) ?? [];
  queue.push(response);
  rpcQueues.set(name, queue);
}

/** Every recorded call made against a given table, in the order they happened. */
export function getTableCalls(table: string): RecordedCall[] {
  return tableCalls.get(table) ?? [];
}

/** Every recorded call made against a given RPC name, in the order they happened. */
export function getRpcCalls(name: string): RecordedRpcCall[] {
  return rpcCalls.get(name) ?? [];
}

/** The distinct table names queried so far, in first-queried order. */
export function getQueriedTables(): string[] {
  return Array.from(tableCalls.keys());
}

/** Clears every queued response and every recorded call. Run automatically after each test. */
export function resetSupabaseMock(): void {
  tableQueues.clear();
  rpcQueues.clear();
  tableCalls.clear();
  rpcCalls.clear();
}

// ---------------------------------------------------------------------------
// The chainable query builder
// ---------------------------------------------------------------------------

/**
 * Mimics the shape of a Supabase `PostgrestFilterBuilder` chain closely
 * enough for the modifiers this codebase actually uses (see the spec's
 * measured-surface table). Every modifier records itself and returns the
 * builder so calls can keep chaining. The builder is awaitable at any
 * point in the chain — `await`-ing it (directly, or implicitly via
 * `single()`/`maybeSingle()`) resolves to the next canned response queued
 * for this table.
 */
class SupabaseQueryMock implements PromiseLike<MockResponse> {
  private readonly call: RecordedCall;

  constructor(private readonly table: string) {
    this.call = { table, method: null, filters: [], terminal: null };
    const calls = tableCalls.get(table) ?? [];
    calls.push(this.call);
    tableCalls.set(table, calls);
  }

  select(columns?: string): this {
    this.call.method = this.call.method ?? 'select';
    this.call.columns = columns;
    return this;
  }

  insert(payload: unknown): this {
    this.call.method = 'insert';
    this.call.payload = payload;
    return this;
  }

  update(payload: unknown): this {
    this.call.method = 'update';
    this.call.payload = payload;
    return this;
  }

  upsert(payload: unknown): this {
    this.call.method = 'upsert';
    this.call.payload = payload;
    return this;
  }

  delete(): this {
    this.call.method = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.call.filters.push({ op: 'eq', args: [column, value] });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.call.filters.push({ op: 'in', args: [column, values] });
    return this;
  }

  order(column: string, options?: unknown): this {
    this.call.filters.push({ op: 'order', args: [column, options] });
    return this;
  }

  limit(count: number): this {
    this.call.filters.push({ op: 'limit', args: [count] });
    return this;
  }

  is(column: string, value: unknown): this {
    this.call.filters.push({ op: 'is', args: [column, value] });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.call.filters.push({ op: 'not', args: [column, operator, value] });
    return this;
  }

  or(filters: string): this {
    this.call.filters.push({ op: 'or', args: [filters] });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.call.filters.push({ op: 'gte', args: [column, value] });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.call.filters.push({ op: 'lte', args: [column, value] });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.call.filters.push({ op: 'ilike', args: [column, pattern] });
    return this;
  }

  single(): this {
    this.call.terminal = 'single';
    return this;
  }

  maybeSingle(): this {
    this.call.terminal = 'maybeSingle';
    return this;
  }

  then<TResult1 = MockResponse, TResult2 = never>(
    onfulfilled?: ((value: MockResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const response = dequeue(tableQueues, this.table, 'table');
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

class SupabaseRpcMock implements PromiseLike<MockResponse> {
  constructor(private readonly name: string, args: unknown) {
    const calls = rpcCalls.get(name) ?? [];
    calls.push({ name, args });
    rpcCalls.set(name, calls);
  }

  then<TResult1 = MockResponse, TResult2 = never>(
    onfulfilled?: ((value: MockResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const response = dequeue(rpcQueues, this.name, 'rpc');
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

// ---------------------------------------------------------------------------
// The fake client — the object that stands in for the real `supabase` export
// ---------------------------------------------------------------------------

export const supabaseMock = {
  from(table: string) {
    return new SupabaseQueryMock(table);
  },
  rpc(name: string, args?: unknown) {
    return new SupabaseRpcMock(name, args);
  },
};
