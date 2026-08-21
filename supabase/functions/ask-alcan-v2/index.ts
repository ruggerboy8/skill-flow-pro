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
// ASK-2 changes how documents are found, never this contract. Citations
// are the documents the model actually called read_document on (the system
// prompt requires reading before citing), not just anything search turned
// up — deliberately simpler and more auditable than relying on passage-
// level citation parsing for a contract that only needs document identity.
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
      'Returns ranked snippets with document ids, titles, statuses, and links. Call this first for any ' +
      'question, and call it again with different phrasing if the first pass comes up thin — do not give ' +
      'up on one query.',
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
      'yet, its title and link). Call this on every document you intend to cite in your answer, even if ' +
      'the search snippet already told you what you needed — this is what makes the citation valid.',
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
2. Before citing any document in your answer, call read_document on it at least once, even if the search snippet already told you what you needed. Only documents you actually read may be cited.
3. Answer only from documents you have read via these tools, and cite them. Never answer from general knowledge about dentistry or business, and NEVER fabricate or guess at a policy, price, number, or procedure.
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
 * retries full-text-only rather than failing the whole tool call. */
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
  if (embedding) {
    try {
      return await attempt(embedding);
    } catch (err) {
      console.error('ask-alcan-v2: search_corpus with embedding failed, retrying FTS-only', err);
    }
  }
  return await attempt(null);
}

async function runReadDocument(caller: SupabaseClient, documentId: string): Promise<CorpusDoc | null> {
  const { data, error } = await caller
    .from('corpus_documents')
    .select('id, title, body, summary, status, source_url')
    .eq('id', documentId)
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
    const documentsRead = new Map<string, { title: string; source_url: string | null }>();
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
            const text = rows.length
              ? rows
                  .map((r) => `[${r.document_id}] ${r.title} (status: ${r.status})\n${r.snippet}`)
                  .join('\n\n---\n\n')
              : 'No matching documents found. Try a different phrasing.';
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: text });
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
              documentsRead.set(doc.id, { title: doc.title, source_url: doc.source_url });
              const bodyText = doc.body ?? '(No extracted text yet — title and link only.)';
              const text = [
                `Title: ${doc.title}`,
                doc.summary ? `Summary: ${doc.summary}` : null,
                `Link: ${doc.source_url ?? '(none)'}`,
                '',
                bodyText,
              ]
                .filter((line) => line !== null)
                .join('\n');
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: text });
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

    const citations = Array.from(documentsRead.entries()).map(([document_id, d]) => ({
      document_id,
      title: d.title,
      source_url: d.source_url,
    }));

    // Tool-loop equivalent of v1's packed-size log: the signal for how the
    // shadow deploy is actually behaving.
    console.log(JSON.stringify({
      event: 'ask-alcan-v2-tool-loop',
      search_calls: searchCallCount,
      tool_calls: toolCallCount,
      documents_read: documentsRead.size,
      input_tokens: finalResponse.usage.input_tokens,
      cache_creation_input_tokens: finalResponse.usage.cache_creation_input_tokens,
      cache_read_input_tokens: finalResponse.usage.cache_read_input_tokens,
      output_tokens: finalResponse.usage.output_tokens,
      stop_reason: finalResponse.stop_reason,
    }));

    await persistExchange(supabase, convo, question, answer, citations.map((c) => c.document_id));

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
