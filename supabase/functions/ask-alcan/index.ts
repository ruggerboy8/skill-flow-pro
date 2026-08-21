// ASK-1: Ask Alcan — the long-context corpus spike.
//
// Answers a super admin's question from the curated corpus (kept + canon
// corpus_documents) with one Claude call using the citations feature. No
// retrieval infrastructure — the whole eligible corpus is packed into the
// request (canon first, then kept, newest first), capped at ~150k tokens.
// The packed-size log below is the signal for when to build ASK-2, and the
// { answer, citations } response shape is FROZEN: ASK-2 changes how
// documents are found, never this contract.
//
// Prompt caching: system prompt + document blocks form a deterministic,
// stable prefix with cache_control on the LAST document block, and the
// user's question comes after it — repeat questions reread the corpus from
// cache (~10x cheaper). Cache usage is logged alongside packed size.
//
// Secrets: ANTHROPIC_API_KEY is a Supabase function secret. Never in the repo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Same constant as src/lib/askAlcanAccess.ts — the spike answers from the
// Alcan org's corpus only.
const ALCAN_ORG_ID = 'a1ca0000-0000-0000-0000-000000000001';

// Answer set for the spike: kept + canon. Flip to ['canon'] later.
const ELIGIBLE_STATUSES = ['kept', 'canon'];

// ~150k tokens of packed corpus, estimated at ~4 chars/token.
const MAX_PACKED_TOKENS = 150_000;
const CHARS_PER_TOKEN = 4;

const MODEL = 'claude-sonnet-5';

// Questions are questions, not documents. Anything longer is a paste-in.
const MAX_QUESTION_CHARS = 4000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CorpusDoc {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  status: string;
  posted_at: string | null;
  source_url: string | null;
}

/**
 * Deterministic packing order — canon first, then kept; newest first within
 * a status; stable tiebreak by id. Determinism matters: any reorder changes
 * the prompt prefix and invalidates the cache.
 */
function packOrder(a: CorpusDoc, b: CorpusDoc): number {
  if (a.status !== b.status) return a.status === 'canon' ? -1 : 1;
  const ap = a.posted_at ?? '';
  const bp = b.posted_at ?? '';
  if (ap !== bp) return ap > bp ? -1 : 1; // newest first, nulls last
  return a.id < b.id ? -1 : 1;
}

function docText(d: CorpusDoc): string {
  const parts = [`Title: ${d.title}`];
  if (d.posted_at) parts.push(`Originally posted: ${d.posted_at.slice(0, 10)}`);
  if (d.summary) parts.push(`Summary: ${d.summary}`);
  parts.push('', d.body ?? '(Full text not yet extracted — title and summary only.)');
  return parts.join('\n');
}

function buildSystemPrompt(areaNames: string[]): string {
  const areas = areaNames.length > 0 ? areaNames.join(', ') : 'RDA practice, clinical, operations';
  return `You are Ask Alcan, an internal assistant for Alcan dental practice staff. You answer questions using ONLY the documents provided in this conversation — they are the curated, current company corpus.

Rules, in priority order:
1. Answer only from the provided documents, and cite the documents you used. Never answer from general knowledge about dentistry or business, and NEVER fabricate or guess at a policy, price, number, or procedure.
2. If the documents do not cover the question, say so plainly and point the person to the expert area that owns that territory (the areas are: ${areas}). One or two warm sentences; no apology theater.
3. If documents contradict each other on the point being asked, say that plainly, cite both, and name the owning expert area as the place to resolve it. Do not pick a side.
4. If someone is venting or looking for a sympathetic ear rather than an answer, respond kindly and briefly, and gently point them to a human — their manager or the owning expert area. Do not turn feelings into policy answers.

Style: warm, plain, and concise, like a helpful colleague. No em dashes. Answer the actual question first; add context only when it helps.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth per the pro-move-suggest template: Bearer + getClaims.
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

    // Gate: super admin only (the Ask Alcan gate — same semantics as
    // src/lib/askAlcanAccess.ts). The Alcan scoping is applied to the data:
    // the corpus is loaded from the Alcan org only.
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

    // The conversation must exist and belong to the asker. (RLS already
    // prevents anyone else creating/reading it; this guards the service-role
    // writes below.)
    const { data: convo } = await supabase
      .from('ask_conversations')
      .select('id, staff_id, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (!convo || convo.staff_id !== me.id) {
      return json({ error: 'Conversation not found' }, 404);
    }

    // Prior turns of this conversation, oldest first, capped at the last 10
    // messages (5 exchanges) — enough context for follow-ups without growing
    // the request unboundedly. History rides AFTER the cache breakpoint, so
    // it never disturbs the cached corpus prefix.
    const { data: priorMessages } = await supabase
      .from('ask_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    const history = ((priorMessages ?? []) as { role: 'user' | 'assistant'; content: string }[])
      .filter((m) => m.content.trim().length > 0)
      .slice(-10);

    // Load the eligible corpus (kept + canon, Alcan org).
    const { data: docs, error: docsErr } = await supabase
      .from('corpus_documents')
      .select('id, title, body, summary, status, posted_at, source_url')
      .eq('org_id', ALCAN_ORG_ID)
      .in('status', ELIGIBLE_STATUSES);
    if (docsErr) throw docsErr;

    const { data: areas } = await supabase
      .from('corpus_expert_areas')
      .select('area_name')
      .eq('org_id', ALCAN_ORG_ID)
      .order('area_name');

    // Pack deterministically up to the token cap.
    const ordered = ((docs ?? []) as CorpusDoc[]).sort(packOrder);
    const packed: { doc: CorpusDoc; text: string }[] = [];
    let packedChars = 0;
    const maxChars = MAX_PACKED_TOKENS * CHARS_PER_TOKEN;
    for (const doc of ordered) {
      const text = docText(doc);
      if (packedChars + text.length > maxChars) break;
      packed.push({ doc, text });
      packedChars += text.length;
    }

    if (packed.length === 0) {
      const answer =
        'The corpus has no reviewed documents yet, so I can\'t answer from it. ' +
        'Once documents are marked kept or canon, I\'ll answer from those.';
      await persistExchange(supabase, convo, question, answer, []);
      return json({ answer, citations: [] });
    }

    // Document blocks form a stable prefix; cache_control goes on the LAST
    // document so system + all documents are cached. Everything volatile —
    // conversation history, then the new question — comes after the cache
    // breakpoint. (Consecutive same-role messages are allowed; the API
    // combines them into one turn.)
    const documentContent: Anthropic.ContentBlockParam[] = packed.map(({ doc, text }, i) => ({
      type: 'document' as const,
      source: { type: 'text' as const, media_type: 'text/plain' as const, data: text },
      title: doc.title,
      citations: { enabled: true },
      ...(i === packed.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: documentContent },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: question.trim() },
    ];

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt((areas ?? []).map((a: { area_name: string }) => a.area_name)),
      messages,
    });

    // Packed-size + cache log: this line is how we learn when the spike
    // stops scaling (the trigger for ASK-2).
    console.log(JSON.stringify({
      event: 'ask-alcan-packed',
      packed_docs: packed.length,
      eligible_docs: ordered.length,
      packed_chars: packedChars,
      est_packed_tokens: Math.round(packedChars / CHARS_PER_TOKEN),
      input_tokens: response.usage.input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    }));

    // Collapse text blocks into the answer; map citation document_index back
    // to our packed docs, deduped in first-cited order.
    let answer = '';
    const citedIndexes: number[] = [];
    for (const block of response.content) {
      if (block.type !== 'text') continue;
      answer += block.text;
      for (const cite of block.citations ?? []) {
        if ('document_index' in cite && !citedIndexes.includes(cite.document_index)) {
          citedIndexes.push(cite.document_index);
        }
      }
    }
    const citations = citedIndexes
      .filter((i) => i >= 0 && i < packed.length)
      .map((i) => ({
        document_id: packed[i].doc.id,
        title: packed[i].doc.title,
        source_url: packed[i].doc.source_url,
      }));

    await persistExchange(supabase, convo, question, answer, citations.map((c) => c.document_id));

    // FROZEN response contract (ASK-2 additivity guarantee): exactly this shape.
    return json({ answer, citations });
  } catch (err) {
    // Detail stays server-side (function logs); the client gets a generic 500.
    console.error('ask-alcan error:', err);
    return json({ error: 'Something went wrong answering that. Please try again.' }, 500);
  }
});

/** Log the exchange to ask_conversations/ask_messages (consent-scoped tables). */
async function persistExchange(
  supabase: ReturnType<typeof createClient>,
  convo: { id: string; title: string | null },
  question: string,
  answer: string,
  citedDocumentIds: string[],
): Promise<void> {
  const { error: msgErr } = await supabase.from('ask_messages').insert([
    { conversation_id: convo.id, role: 'user', content: question.trim() },
    {
      conversation_id: convo.id,
      role: 'assistant',
      content: answer,
      cited_document_ids: citedDocumentIds,
    },
  ]);
  if (msgErr) throw msgErr;
  // Touch the conversation (bumps updated_at); set a title on first use.
  const title = convo.title ?? question.trim().slice(0, 80);
  const { error: convoErr } = await supabase
    .from('ask_conversations')
    .update({ title })
    .eq('id', convo.id);
  if (convoErr) throw convoErr;
}
