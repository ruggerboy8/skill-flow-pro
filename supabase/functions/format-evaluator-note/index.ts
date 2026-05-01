import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5-nano",
          messages: [
            {
              role: "system",
              content: `You are a formatting assistant. You receive a "Note from your Evaluator" written by a clinical director or coach to a staff member as part of a quarterly evaluation.

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

Return ONLY the formatted text, with no preamble, no quotes, and no explanation.`,
            },
            { role: "user", content: text },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let formatted = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Guardrail: strip meta-commentary preamble
    const metaPrefixes = ["here's", "here is", "sure", "the cleaned", "the formatted", "below is"];
    const firstLine = formatted.split("\n")[0].toLowerCase();
    if (metaPrefixes.some(p => firstLine.startsWith(p))) {
      const rest = formatted.split("\n").slice(1).join("\n").trim();
      formatted = rest.length > 0 ? rest : formatted;
    }

    // Guardrail: empty output -> fall back to original
    if (!formatted || formatted.trim().length === 0) {
      formatted = text;
    }

    // Guardrail: length sanity. Strip whitespace before comparing so added
    // line breaks don't inflate length and shrunken output still trips the check.
    const stripWs = (s: string) => s.replace(/\s+/g, "");
    const origCompact = stripWs(text);
    const newCompact = stripWs(formatted);
    if (newCompact.length < origCompact.length * 0.9 || newCompact.length > origCompact.length * 1.1) {
      console.warn("Formatted output character count drifted >10%, falling back to original");
      formatted = text;
    }

    return new Response(
      JSON.stringify({ formatted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("format-evaluator-note error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
