import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a formatting assistant. You receive a "Note from your Evaluator" written by a clinical director or coach to a staff member as part of a quarterly evaluation.

Your job is ONLY to improve readability and visual structure. Follow these rules strictly:

- DO NOT change any wording, language, phrasing, or tone.
- DO NOT add new content, sentences, or commentary.
- DO NOT remove any content.
- DO NOT paraphrase or rewrite.
- DO NOT change clinical terms, proper nouns, or names.

What you MAY do:
- Add blank lines (paragraph breaks) between distinct paragraphs and between sections so it reads cleanly.
- Preserve and clearly separate section headings (e.g. "Schedule Awareness and Preparation") from their following paragraph by putting them on their own line with a blank line before and after.
- Fix obvious punctuation/capitalization issues (missing period, double space) only when unambiguous.
- Use plain text only — no markdown symbols like **, ##, or backticks. No bullet characters unless the original already used them.

Return ONLY the formatted text, with no preamble, no quotes, and no explanation.`;

async function formatNote(text: string): Promise<string | null> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-nano",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
    }),
  });
  if (!r.ok) {
    console.error("AI error", r.status, await r.text());
    return null;
  }
  const data = await r.json();
  let out: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  const meta = ["here's", "here is", "sure", "the cleaned", "the formatted", "below is"];
  const firstLine = out.split("\n")[0].toLowerCase();
  if (meta.some((p) => firstLine.startsWith(p))) {
    const rest = out.split("\n").slice(1).join("\n").trim();
    if (rest) out = rest;
  }
  const stripWs = (s: string) => s.replace(/\s+/g, "");
  const o = stripWs(text), n = stripWs(out);
  if (n.length < o.length * 0.9 || n.length > o.length * 1.1) {
    console.warn("length drift, skipping");
    return null;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { ids, dryRun } = await req.json();
    if (!Array.isArray(ids)) {
      return new Response(JSON.stringify({ error: "ids must be array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rows, error } = await admin
      .from("evaluations")
      .select("id, evaluator_note")
      .in("id", ids);
    if (error) throw error;
    const results: any[] = [];
    for (const row of rows ?? []) {
      if (!row.evaluator_note) {
        results.push({ id: row.id, status: "no_note" });
        continue;
      }
      const formatted = await formatNote(row.evaluator_note);
      if (!formatted || formatted === row.evaluator_note) {
        results.push({ id: row.id, status: "unchanged" });
        continue;
      }
      if (!dryRun) {
        const { error: upErr } = await admin
          .from("evaluations")
          .update({ evaluator_note: formatted })
          .eq("id", row.id);
        if (upErr) {
          results.push({ id: row.id, status: "update_failed", error: upErr.message });
          continue;
        }
      }
      results.push({
        id: row.id,
        status: dryRun ? "would_update" : "updated",
        before_len: row.evaluator_note.length,
        after_len: formatted.length,
      });
    }
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
