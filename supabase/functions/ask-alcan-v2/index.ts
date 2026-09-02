// ASK-2: Ask Alcan v2 — the hybrid search + tool loop assistant.
//
// SHADOW DEPLOY. This is a separate function from the live `ask-alcan`
// (the long-context spike), deployed under its own name so it can be tested
// end-to-end with real questions before an attended cutover replaces
// ask-alcan's code with this. Do not point the frontend at this function
// until that cutover happens.
//
// Instead of packing the whole corpus into every request, Claude runs with
// two tools: search_corpus(query) (hybrid full-text + vector search, fused
// with reciprocal rank fusion, via the SECURITY INVOKER search_corpus SQL
// function) and read_document(document_id) (fetch a document's full body,
// or its title + link for videos and files with no extracted text yet).
// The model searches, reads, refines, and answers — recovering from a bad
// first search and staying correct however large the corpus grows.
//
// The { answer, citations } response shape is FROZEN, unchanged from v1:
// ASK-2 changes how documents are found, never this contract.
//
// Citations fix (found in live QA): citations used to be built only from
// documentsRead (documents the model called read_document on), but Sonnet
// frequently answers straight from the rich search_corpus snippets and
// skips read_document despite the system prompt asking for it, so citations
// silently came back empty on well-covered questions. Fixed the same way
// v1 solves it: Anthropic's native citations feature. Every document the
// model is shown -- each search_corpus row AND every read_document body --
// is sent as a `document` content block (citations: {enabled: true}) inside
// the tool_result, instead of/alongside plain text, and appended in that
// same order to `citableDocs`. After the loop, citations are recovered from
// finalResponse.content's document_index citations, mapped back through
// citableDocs -- see supabase/functions/_shared/citationMapping.ts. A
// document the model never actually cites (even if surfaced by search)
// produces no citation, same as before.
//
// Retrieval (search_corpus, read_document) runs through a caller-scoped
// Supabase client carrying the asker's own JWT, so RLS is the real
// visibility boundary (today: super-admin only, via is_superadmin()) —
// not just the app-level gate below, which stays as a fast, friendly 403.
// Conversation persistence stays on the service-role client, as in v1.
//
// Secrets: ANTHROPIC_API_KEY and OPENAI_API_KEY are Supabase function
// secrets. Never in the repo.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { collectCitations, type CitableDoc } from '../_shared/citationMapping.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Same constant as src/lib/askAlcanAccess.ts and v1 — the Alcan org's
// corpus only.
const ALCAN_ORG_ID = 'a1ca0000-0000-0000-0000-000000000001';

const MODEL = 'claude-sonnet-5';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_QUESTION_CHARS = 4000;
const MAX_TOOL_CALLS = 8;
// A little headroom over MAX_TOOL_CALLS: each iteration can make several
// tool calls in one turn, so iterations alone don't bound total calls, but
// this keeps a hung loop from running away.
const MAX_ITERATIONS = MAX_TOOL_CALLS + 2;
const SEARCH_MATCH_COUNT = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface SearchRow {
  document_id: string;
  title: string;
  source_url: string | null;
  status: string;
  snippet: string;
  rank: number;
}

interface CorpusDoc {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  status: string;
  source_url: string | null;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'search_corpus',
    description:
      'Search the Alcan knowledge corpus (kept and canon documents) with a natural-language query. ' +
      'Returns ranked snippets with document ids, titles, statuses, and links, each provided to you as ' +
      'citable source content — cite a snippet directly if it answers the question. Call this first for ' +
      'any question, and call it again with different phrasing if the first pass comes up thin — do not ' +
      'give up on one query.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A natural-language search query.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_document',
    description:
      "Fetch a document's full text by its document_id (or, for videos and files with no extracted text " +
      'yet, its title and link), also provided to you as citable source content. Call this when a search ' +
      'snippet is too thin to answer confidently, or to confirm a number, price, or policy before you ' +
      'state it — reading is not required to cite a document, but is required before relying on more of ' +
      'it than the snippet showed you.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'The document_id returned by search_corpus.' },
      },
      required: ['document_id'],
    },
  },
];

function buildSystemPrompt(areaNames: string[]): string {
  const areas = areaNames.length > 0 ? areaNames.join(', ') : 'RDA practice, clinical, operations';
  return `You are Ask Alcan, an internal assistant for Alcan dental practice staff. You have two tools: search_corpus(query) to find candidate documents, and read_document(document_id) to fetch one in full (or its title and link, for videos and files with no extracted text yet).

Rules, in priority order:
1. Search before answering. Start with search_corpus, and search again with different phrasing if the first pass comes up thin.
2. Every document search_corpus or read_document gives you is citable source content — use Claude's citation mechanism on the specific passage you drew a claim from, rather than paraphrasing without a citation. Call read_document when a snippet is too thin to answer from confidently, or to confirm a number, price, or policy before you state it; you do not have to read a document first just to cite it.
3. Answer only from documents you have been given via these tools, and cite them. Never answer from general knowledge about dentistry or business, and NEVER fabricate or guess at a policy, price, number, or procedure.
4. If the best source for a question is a video or a file whose text hasn't been extracted yet, say so plainly and still name and cite it, so the person can go watch or open it themselves.
5. If the documents do not cover the question, say so plainly and point the person to the expert area that owns that territory (the areas are: ${areas}). One or two warm sentences; no apology theater.
6. If documents contradict each other on the point being asked, say that plainly, cite both, and name the owning expert area as the place to resolve it. Do not pick a side.
7. If someone is venting or looking for a sympathetic ear rather than an answer, respond kindly and briefly, and gently point them to a human — their manager or the owning expert area. Do not turn feelings into policy answers.

Style: warm, plain, and concise, like a helpful colleague. No em dashes. Answer the actual question first; add context only when it helps.`;
}

/** Embed a query with OpenAI. Returns null (not a thrown error) on any
 * failure so callers can fall back to full-text-only search. */
async function embedQuery(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    if (!res.ok) {
      console.error('ask-alcan-v2: embedding request failed', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error('ask-alcan-v2: embedding error', err);
    return null;
  }
}

/** Hybrid search via the SECURITY INVOKER search_corpus SQL function, on
 * the caller-scoped client so RLS applies. Tries with the query embedding
 * first; if the RPC call itself errors (e.g. a parameter-casting issue),
 * retries full-text-only rather than failing the whole tool call.
 *
 * QA fix (ASK-2): search_corpus has no org_id parameter (it only filters
 * status in kept/canon), unlike v1 which explicitly loads only the Alcan
 * org's documents. That is harmless today (corpus_documents only has
 * Alcan-org rows, and every current super admin is in the Alcan org), but
 * askAlcanAccess.ts is explicit that super admins from OTHER orgs (e.g.
 * Avenue Dental) are meant to reach Ask Alcan too, and other orgs are
 * actively coming online. Left as-is, the day another org gets corpus rows
 * and/or a non-Alcan super admin, search_corpus would surface them. Belt-
 * and-suspenders post-filter here so v2 cannot leak cross-org documents
 * even before the SQL function itself is fixed (see the proposed follow-up
 * migration noted in the PR). */
async function runSearchCorpus(
  caller: SupabaseClient,
  query: string,
  embedding: number[] | null,
): Promise<SearchRow[]> {
  const attempt = async (queryEmbedding: number[] | null): Promise<SearchRow[]> => {
    const { data, error } = await caller.rpc('search_corpus', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: SEARCH_MATCH_COUNT,
    });
    if (error) throw error;
    return (data ?? []) as SearchRow[];
  };
  const rows = embedding
    ? await (async () => {
        try {
          return await attempt(embedding);
        } catch (err) {
          console.error('ask-alcan-v2: search_corpus with embedding failed, retrying FTS-only', err);
          return await attempt(null);
        }
      })()
    : await attempt(null);
  return filterToAlcanOrg(caller, rows);
}

/** QA fix (ASK-2): search_corpus's result rows carry no org_id, so filter
 * them against corpus_documents (caller-scoped, RLS-governed) before they
 * ever reach the model. See the comment on runSearchCorpus. */
async function filterToAlcanOrg(caller: SupabaseClient, rows: SearchRow[]): Promise<SearchRow[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await caller
    .from('corpus_documents')
    .select('id')
    .eq('org_id', ALCAN_ORG_ID)
    .in('id', rows.map((r) => r.document_id));
  if (error) throw error;
  const allowed = new Set((data ?? []).map((d: { id: string }) => d.id));
  return rows.filter((r) => allowed.has(r.document_id));
}

async function runReadDocument(caller: SupabaseClient, documentId: string): Promise<CorpusDoc | null> {
  const { data, error } = await caller
    .from('corpus_documents')
    .select('id, title, body, summary, status, source_url')
    .eq('id', documentId)
    // QA fix (ASK-2): v1 scopes its whole corpus load to ALCAN_ORG_ID; this
    // tool-driven fetch had no equivalent org filter. See runSearchCorpus.
    .eq('org_id', ALCAN_ORG_ID)
    .in('status', ['kept', 'canon'])
    .maybeSingle();
  if (error) throw error;
  return (data as CorpusDoc | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth per the pro-move-suggest / ask-alcan-v1 template: Bearer + getClaims.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await caller.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const callerUserId = claims.claims.sub as string;

    // App-level gate: super admin only (same semantics as v1 and
    // src/lib/askAlcanAccess.ts). This is a fast, friendly 403 in front of
    // the real boundary — RLS on corpus_documents/corpus_chunks below, via
    // the caller-scoped client, governs the actual data access.
    const { data: me } = await supabase
      .from('staff')
      .select('id, is_super_admin')
      .eq('user_id', callerUserId)
      .maybeSingle();
    if (!me?.is_super_admin) return json({ error: 'Forbidden' }, 403);

    if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    let body: { question?: unknown; conversation_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const { question, conversation_id: conversationId } = body;
    if (typeof question !== 'string' || !question.trim() || typeof conversationId !== 'string') {
      return json({ error: 'question and conversation_id required' }, 400);
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return json({ error: `question exceeds ${MAX_QUESTION_CHARS} characters` }, 400);
    }

    const { data: convo } = await supabase
      .from('ask_conversations')
      .select('id, staff_id, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (!convo || convo.staff_id !== me.id) {
      return json({ error: 'Conversation not found' }, 404);
    }

    // Prior turns, oldest first, capped at the last 10 messages — same
    // policy as v1. History rides after the cached system+tools prefix.
    const { data: priorMessages } = await supabase
      .from('ask_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    const history = ((priorMessages ?? []) as { role: 'user' | 'assistant'; content: string }[])
      .filter((m) => m.content.trim().length > 0)
      .slice(-10);

    const { data: areas } = await supabase
      .from('corpus_expert_areas')
      .select('area_name')
      .eq('org_id', ALCAN_ORG_ID)
      .order('area_name');

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Cache breakpoint on the system block: everything before it (tool
    // definitions, then system) forms a stable, deterministic prefix that
    // repeats on every question, unlike v1 where the corpus itself rode in
    // the prompt. Conversation history and the new question come after.
    const system: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: buildSystemPrompt((areas ?? []).map((a: { area_name: string }) => a.area_name)),
        cache_control: { type: 'ephemeral' },
      },
    ];

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question.trim() },
    ];

    let toolCallCount = 0;
    let searchCallCount = 0;
    let readDocumentCount = 0;
    // Every document content block shown to the model, in the exact order
    // it was pushed into `messages` -- Anthropic numbers document_index
    // 0-based across the whole request in that same order, so this array's
    // ordering must track the tool_result construction below exactly. A
    // document can appear more than once (a search_corpus snippet, then a
    // fuller read_document body); collectCitations() dedupes by document_id
    // afterward, so pushing every occurrence here is intentional, not a bug.
    const citableDocs: CitableDoc[] = [];
    let finalResponse: Anthropic.Message | undefined;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        tools,
        messages,
      });
      finalResponse = response;
      if (response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        if (toolCallCount >= MAX_TOOL_CALLS) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            is_error: true,
            content:
              'Tool call limit reached for this question. Answer with what you have so far, and say ' +
              'plainly if that is not enough to fully answer.',
          });
          continue;
        }
        toolCallCount++;

        if (block.name === 'search_corpus') {
          searchCallCount++;
          const query = typeof (block.input as { query?: unknown })?.query === 'string'
            ? (block.input as { query: string }).query
            : '';
          try {
            const embedding = OPENAI_API_KEY ? await embedQuery(query, OPENAI_API_KEY) : null;
            const rows = await runSearchCorpus(caller, query, embedding);
            if (rows.length === 0) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'No matching documents found. Try a different phrasing.',
              });
            } else {
              // Citations fix: one citable `document` block per row, in
              // result order, instead of one plain-text blob. The snippet
              // itself is the citable source text; document_id/status ride
              // in `context` (visible to the model, not citable) so
              // read_document's document_id argument still works.
              const documentBlocks: Anthropic.DocumentBlockParam[] = rows.map((r) => {
                citableDocs.push({ document_id: r.document_id, title: r.title, source_url: r.source_url });
                return {
                  type: 'document',
                  source: { type: 'text', media_type: 'text/plain', data: r.snippet },
                  title: r.title,
                  context: `document_id: ${r.document_id} (status: ${r.status})`,
                  citations: { enabled: true },
                };
              });
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: documentBlocks });
            }
          } catch (err) {
            console.error('ask-alcan-v2: search_corpus failed', err);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: 'Search failed. Tell the person search is temporarily unavailable rather than guessing.',
            });
          }
        } else if (block.name === 'read_document') {
          const documentId = typeof (block.input as { document_id?: unknown })?.document_id === 'string'
            ? (block.input as { document_id: string }).document_id
            : '';
          try {
            const doc = documentId ? await runReadDocument(caller, documentId) : null;
            if (!doc) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                is_error: true,
                content: 'Document not found or not eligible to cite.',
              });
            } else {
              readDocumentCount++;
              citableDocs.push({ document_id: doc.id, title: doc.title, source_url: doc.source_url });
              // Citations fix: the full body is the citable document block,
              // same mechanism as search_corpus rows above -- a doc the
              // model chooses to read in full is citable through the same
              // native-citations path, not a separate "reading makes it
              // citable" rule.
              const bodyText = doc.body ?? '(No extracted text yet — title and link only.)';
              const context = [
                `document_id: ${doc.id}`,
                doc.summary ? `Summary: ${doc.summary}` : null,
                `Link: ${doc.source_url ?? '(none)'}`,
              ]
                .filter((line) => line !== null)
                .join('\n');
              const documentBlock: Anthropic.DocumentBlockParam = {
                type: 'document',
                source: { type: 'text', media_type: 'text/plain', data: bodyText },
                title: doc.title,
                context,
                citations: { enabled: true },
              };
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [documentBlock] });
            }
          } catch (err) {
            console.error('ask-alcan-v2: read_document failed', err);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: 'Failed to read that document. Tell the person this is temporarily unavailable.',
            });
          }
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            is_error: true,
            content: `Unknown tool: ${block.name}`,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (!finalResponse) {
      // Should be unreachable (the loop always runs at least once), but
      // never answer from nothing rather than guessing.
      const answer = "Something went wrong answering that. Please try again.";
      await persistExchange(supabase, convo, question, answer, []);
      return json({ answer, citations: [] });
    }

    let answer = '';
    for (const block of finalResponse.content) {
      if (block.type === 'text') answer += block.text;
    }
    if (!answer.trim() && finalResponse.stop_reason === 'tool_use') {
      // Hit MAX_ITERATIONS still mid tool-use — be honest about it rather
      // than returning an empty answer.
      answer =
        "I wasn't able to finish researching that in time. Please try asking again, maybe with a " +
        'more specific phrasing.';
    }

    // Citations fix: recover citations from Claude's native document_index
    // citations on finalResponse's text blocks, mapped back through
    // citableDocs -- mirrors v1's packed-doc mapping exactly. See
    // supabase/functions/_shared/citationMapping.ts.
    const citations = collectCitations(finalResponse.content, citableDocs);

    // Tool-loop equivalent of v1's packed-size log: the signal for how the
    // shadow deploy is actually behaving. citable_docs_surfaced and
    // citations_returned are new with the citations fix -- they used to be
    // identical to documents_read by construction (citations came only from
    // documentsRead), so watching them diverge is the signal the fix is
    // doing something: citations_returned should now be > 0 even on turns
    // where documents_read is 0.
    console.log(JSON.stringify({
      event: 'ask-alcan-v2-tool-loop',
      search_calls: searchCallCount,
      tool_calls: toolCallCount,
      documents_read: readDocumentCount,
      citable_docs_surfaced: citableDocs.length,
      citations_returned: citations.length,
      input_tokens: finalResponse.usage.input_tokens,
      cache_creation_input_tokens: finalResponse.usage.cache_creation_input_tokens,
      cache_read_input_tokens: finalResponse.usage.cache_read_input_tokens,
      output_tokens: finalResponse.usage.output_tokens,
      stop_reason: finalResponse.stop_reason,
    }));

    // QA fix (ASK-2): the answer is already paid for (an Anthropic call was
    // made) — a persistence failure must not discard it, matching v1's
    // explicit handling. Previously this awaited unguarded, so a transient
    // ask_messages write failure would throw, get caught by the outer
    // handler below, and return a generic 500 instead of the real answer.
    try {
      await persistExchange(supabase, convo, question, answer, citations.map((c) => c.document_id));
    } catch (persistErr) {
      console.error('ask-alcan-v2 persist failure (answer still returned):', persistErr);
    }

    // FROZEN response contract (unchanged from v1): exactly this shape.
    return json({ answer, citations });
  } catch (err) {
    console.error('ask-alcan-v2 error:', err);
    return json({ error: 'Something went wrong answering that. Please try again.' }, 500);
  }
});

/** Log the exchange to ask_conversations/ask_messages (consent-scoped tables). */
async function persistExchange(
  supabase: SupabaseClient,
  convo: { id: string; title: string | null },
  question: string,
  answer: string,
  citedDocumentIds: string[],
): Promise<void> {
  const { error: msgErr } = await supabase.from('ask_messages').insert([
    // cited_document_ids must be explicit: PostgREST bulk inserts null-fill
    // columns missing from a row rather than applying the column default,
    // and the column is NOT NULL.
    { conversation_id: convo.id, role: 'user', content: question.trim(), cited_document_ids: [] },
    {
      conversation_id: convo.id,
      role: 'assistant',
      content: answer,
      cited_document_ids: citedDocumentIds,
    },
  ]);
  if (msgErr) throw msgErr;
  const title = convo.title ?? question.trim().slice(0, 80);
  const { error: convoErr } = await supabase
    .from('ask_conversations')
    .update({ title })
    .eq('id', convo.id);
  if (convoErr) throw convoErr;
}
