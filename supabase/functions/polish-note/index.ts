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
    const { text, context } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional focus context so the polish stays specific and does not reinterpret
    // domain/competency names (e.g. "Cultural" is a performance domain, not patient
    // cultural backgrounds).
    let contextBlock = "";
    if (context && typeof context === "object") {
      const focusAreas = Array.isArray(context.focusAreas) ? context.focusAreas : [];
      const proMoves = Array.isArray(context.proMoves) ? context.proMoves : [];
      const lines: string[] = [];
      for (const f of focusAreas) {
        if (f && f.competency) {
          lines.push(`- ${f.competency}${f.domain ? ` (${f.domain} domain)` : ""}${f.about ? `: ${f.about}` : ""}`);
        }
      }
      for (const pm of proMoves) {
        if (typeof pm === "string" && pm.trim()) lines.push(`- Pro Move: ${pm}`);
      }
      if (lines.length) {
        contextBlock =
          `\n\nThe person chose these focus areas this quarter. Keep the note grounded in these exact areas and preserve any names they reference:\n${lines.join("\n")}`;
      }
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
              content: `You are a writing assistant helping a dental-practice team member write a short personal note to themselves about what they want to focus on this quarter at work.
Polish the text so it's clear, concise, and well-written. Keep the same meaning and first-person voice. Keep it under 500 characters.
This is workplace performance coaching with four performance DOMAINS: Clinical, Clerical, Cultural, and Case Acceptance. These are categories of job performance, not patient demographics, cultural backgrounds, or clinical procedures. Treat any domain or competency name the person uses as the proper name of a focus area and preserve it exactly; never reinterpret it (for example, "Cultural" means the Cultural performance domain, not patients' cultural backgrounds). Preserve the person's specific intent and any competencies or Pro Moves they named; do not invent new focus areas.${contextBlock}
Return ONLY the polished text, nothing else, no quotes, no explanation.`,
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
    const polished = data.choices?.[0]?.message?.content?.trim() ?? text;

    return new Response(
      JSON.stringify({ polished }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("polish-note error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
