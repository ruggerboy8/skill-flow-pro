import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Evaluation overhaul (Phase 1, Workstream A).
//
// Per-domain feedback slotter for the rebuilt capture flow. Built ALONGSIDE the
// live map-observation-notes function (which the current EvaluationHub still
// uses) so nothing breaks during the migration.
//
// Contract differs from map-observation-notes in three ways:
//   1. Scoped to ONE domain's competencies (not the whole eval).
//   2. Takes two already-labeled inputs (glowText, growText) instead of one
//      blob + a tap-timeline, so the model never has to infer praise vs critique.
//   3. Returns per-competency { glow, grow } instead of a single note.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_NOTE_CHARS = 600;

interface CompetencyInput {
  id: number;
  name: string;
  proMoves?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain, competencies, glowText, growText } = await req.json() as {
      domain?: string;
      competencies?: CompetencyInput[];
      glowText?: string;
      growText?: string;
    };

    if (!competencies?.length) {
      return new Response(
        JSON.stringify({ error: "competencies are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!glowText?.trim() && !growText?.trim()) {
      // Nothing to slot; return empty rather than erroring so the UI can proceed.
      return new Response(
        JSON.stringify({ items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // Build the competency reference, anchoring each with its Pro Moves so the
    // model can match observations to the right competency.
    const competencyList = competencies
      .map((c) => {
        const moves = (c.proMoves ?? [])
          .map((m) => `    * ${m}`)
          .join("\n");
        return `- ID ${c.id}: "${c.name}"${moves ? `\n${moves}` : ""}`;
      })
      .join("\n");

    const systemPrompt = `You are a coaching-notes assistant for a dental-practice performance evaluation. You are working within a single domain${domain ? ` ("${domain}")` : ""}.

The evaluator gave two separate pieces of feedback about one team member:
- GLOW: what the person is doing well (reinforcing feedback).
- GROW: what they could improve (growth feedback).

Your job is to split each into per-competency coaching notes and slot them under the right competency, using the competency names and their Pro Moves to decide where each observation belongs.

Write every note in warm, second-person coaching voice, addressed to the team member ("You consistently...", "I noticed how you...", "The next level is to..."):
- GLOW notes name a specific behavior AND its impact.
- GROW notes are forward-looking and specific: an opportunity and a concrete next step, never a verdict.
- Fix grammar, remove filler and false starts, expand shorthand into clear, natural sentences.
- Preserve the evaluator's specific examples. Do NOT fabricate anything not present in the input.
- Keep each note to 2-4 sentences, max ${MAX_NOTE_CHARS} characters.
- A competency appears at most once. If a competency has no relevant glow or grow content, omit that field. If it has neither, omit the competency entirely.

Available competencies in this domain:
${competencyList}`;

    const userContent =
      `GLOW (what they do well):\n${glowText?.trim() || "(none provided)"}\n\n` +
      `GROW (what to improve):\n${growText?.trim() || "(none provided)"}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "slot_feedback",
              description:
                "Return per-competency Glow and Grow coaching notes slotted from the evaluator's domain feedback.",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        competency_id: { type: "number", description: "The competency ID this note belongs to" },
                        glow: { type: "string", description: "Reinforcing coaching note, you-voice, or omit if none" },
                        grow: { type: "string", description: "Growth coaching note, you-voice, or omit if none" },
                      },
                      required: ["competency_id"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "slot_feedback" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No tool call response from AI");

    const result = JSON.parse(toolCall.function.arguments);

    // Validate: only known competency IDs, dedupe, enforce length, drop empties.
    const validIds = new Set(competencies.map((c) => c.id));
    const seen = new Set<number>();
    const items = (result.items || [])
      .filter((it: { competency_id: number }) => {
        if (!validIds.has(it.competency_id)) return false;
        if (seen.has(it.competency_id)) return false;
        seen.add(it.competency_id);
        return true;
      })
      .map((it: { competency_id: number; glow?: string; grow?: string }) => {
        const glow = it.glow?.trim() ? it.glow.trim().slice(0, MAX_NOTE_CHARS) : null;
        const grow = it.grow?.trim() ? it.grow.trim().slice(0, MAX_NOTE_CHARS) : null;
        return { competency_id: it.competency_id, glow, grow };
      })
      .filter((it: { glow: string | null; grow: string | null }) => it.glow || it.grow);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("slot-domain-feedback error:", e);
    // 200 with structured error so the client sees the real message
    // (supabase.functions.invoke swallows the body on non-2xx responses).
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
