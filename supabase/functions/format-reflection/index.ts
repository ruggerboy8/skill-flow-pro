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
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You are a formatting assistant. You receive a short personal reflection written by a dental professional after completing a self-assessment.

Your job is ONLY to improve readability. Follow these rules strictly:

- Do not add new information.
- Do not remove any information.
- Do not change tone or voice.
- Do not paraphrase.
- Only fix grammar, punctuation, and formatting.
- If a sentence is unclear, keep the wording but improve punctuation; do not reinterpret.
- Preserve all proper nouns and clinical terms verbatim.
- Output plain text only. Use bullet points if the speaker lists multiple items.
- Keep the first-person voice.

Return ONLY the formatted text, nothing else — no quotes, no explanation, no preamble.`,
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
    const metaPrefixes = ["here's", "sure", "the cleaned", "the formatted", "below is"];
    const firstLine = formatted.split("\n")[0].toLowerCase();
    if (metaPrefixes.some(p => firstLine.startsWith(p))) {
      // Remove the first line and try the rest
      const rest = formatted.split("\n").slice(1).join("\n").trim();
      formatted = rest.length > 0 ? rest : formatted;
    }

    // Guardrail: if output is empty, fall back to original
    if (!formatted || formatted.trim().length === 0) {
      formatted = text;
    }

    // Guardrail: if output is >15% shorter than input, fall back to original
    if (formatted.length < text.length * 0.85) {
      console.warn("Formatted output too short, falling back to original");
      formatted = text;
    }

    return new Response(
      JSON.stringify({ formatted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("format-reflection error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
