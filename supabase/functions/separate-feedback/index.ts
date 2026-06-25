import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Evaluation capture (Tim's model): the coach selects ONE competency, talks
// about everything they saw (good and not-yet), and hits Polish. This function
// splits that single passage into a Glow and a Grow for that competency. No
// competency attribution is needed (the competency is already chosen), which
// removes the hardest, least reliable part of the old slot-domain-feedback.
//
// If existing glow/grow are passed (the coach adds more and re-polishes), the
// new feedback is integrated and the complete, updated glow/grow are returned.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_NOTE_CHARS = 700;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { competency, text, existingGlow, existingGrow, avoid } = await req.json() as {
      competency?: { name?: string; description?: string | null; proMoves?: string[] };
      text?: string;
      existingGlow?: string | null;
      existingGrow?: string | null;
      avoid?: string[];
    };

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No feedback text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const compName = competency?.name?.trim() || "this competency";
    const covers = competency?.description?.trim() ? `\nWhat it covers: ${competency.description.trim()}` : "";
    const moves = (competency?.proMoves ?? []).length
      ? `\nExample behaviors (Pro Moves):\n${competency!.proMoves!.map((m) => `  * ${m}`).join("\n")}`
      : "";
    const existing =
      existingGlow?.trim() || existingGrow?.trim()
        ? `\n\nThe competency already has these notes; integrate the new feedback into them and return the complete, updated versions:\nGLOW: ${existingGlow?.trim() || "(none)"}\nGROW: ${existingGrow?.trim() || "(none)"}`
        : "";

    const avoidBlock =
      Array.isArray(avoid) && avoid.length
        ? `\n\nOther notes in this same evaluation already open with these phrasings. Deliberately open and structure yours DIFFERENTLY so no two notes read alike:\n${avoid.map((a) => `  - "${a}..."`).join("\n")}`
        : "";

    const systemPrompt = `You are a coaching-notes assistant for a dental-practice performance evaluation. The evaluator just gave spoken or typed feedback about ONE competency: "${compName}".${covers}${moves}

Split their feedback into exactly two coaching notes for this competency:
- GLOW: what the person is doing well. Name a specific behavior and its impact.
- GROW: what they could improve. Forward-looking and specific: an opportunity and a concrete next step, never a verdict.

Write both in a warm, natural, second-person coaching voice (address the team member as "you"). Sound like a real supportive manager talking to a teammate they respect: relaxed and human, not stiff or corporate, and not gushing.

VARY YOUR WRITING. This is critical: across an evaluation a coach writes many of these, and they must NOT all sound the same. Do not fall back on formulaic openings. In particular, never start a Grow with stock phrases like "The next level is to", "One opportunity", "Consider", or "Try to". Open differently each time, vary sentence length and structure, and let the specific observation drive the wording. Write the way a thoughtful person actually talks, never from a template.

Fix grammar, remove filler and false starts, expand shorthand into clear sentences. Preserve the evaluator's specific examples; do not fabricate anything not in the feedback. Keep each note to 2-4 sentences, max ${MAX_NOTE_CHARS} characters. If the feedback genuinely contains no growth (or no glow) content, return an empty string for that field rather than inventing one.${avoidBlock}${existing}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.9,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "split_feedback",
              description: "Return the Glow and Grow coaching notes for this competency.",
              parameters: {
                type: "object",
                properties: {
                  glow: { type: "string", description: "Reinforcing note, you-voice. Empty string if none." },
                  grow: { type: "string", description: "Growth note, you-voice. Empty string if none." },
                },
                required: ["glow", "grow"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "split_feedback" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call response from AI");
    const result = JSON.parse(toolCall.function.arguments);

    const glow = result.glow?.trim() ? result.glow.trim().slice(0, MAX_NOTE_CHARS) : null;
    const grow = result.grow?.trim() ? result.grow.trim().slice(0, MAX_NOTE_CHARS) : null;

    return new Response(JSON.stringify({ glow, grow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("separate-feedback error:", e);
    // 200 with structured error so the client sees the real message.
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
