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
    const { html } = await req.json();
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No content provided" }),
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
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a formatting assistant for a clinical coaching program. You receive rough meeting agenda notes written by a Clinical Director in HTML format.

Your job is to format the content into a clean, professional meeting agenda using HTML. Follow these rules:

- Keep all original content and meaning intact — do not add or remove information.
- Organize into clear sections with headings (use <h3> tags).
- Use bullet lists (<ul><li>) for discussion points.
- Use numbered lists (<ol><li>) for sequential items or action steps.
- Bold key topics or names with <strong> tags.
- Add a horizontal rule (<hr>) between major sections if there are multiple topics.
- Keep the tone professional but warm — this is a coaching conversation, not a corporate meeting.
- If there are time estimates mentioned, preserve them.
- Output valid HTML only. No markdown. No wrapper tags like <html> or <body>.
- Do not add any preamble, explanation, or meta-commentary. Output ONLY the formatted HTML.`,
            },
            { role: "user", content: html },
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

    // Strip markdown code fences if present
    if (formatted.startsWith("```html")) {
      formatted = formatted.slice(7);
    } else if (formatted.startsWith("```")) {
      formatted = formatted.slice(3);
    }
    if (formatted.endsWith("```")) {
      formatted = formatted.slice(0, -3);
    }
    formatted = formatted.trim();

    // Guardrail: if output is empty, fall back to original
    if (!formatted || formatted.trim().length === 0) {
      formatted = html;
    }

    return new Response(
      JSON.stringify({ formatted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("format-agenda error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
