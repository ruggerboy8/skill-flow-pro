import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, timeline, competencies } = await req.json();

    if (!transcript || !competencies?.length) {
      return new Response(
        JSON.stringify({ error: "transcript and competencies are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build competency list for the prompt
    const competencyList = competencies
      .map((c: { id: number; name: string; domain: string }) => `- ID ${c.id}: "${c.name}" (${c.domain})`)
      .join("\n");

    // Build timeline context if available
    let timelineContext = "";
    if (timeline && timeline.length > 0) {
      const timelineEntries = timeline
        .map((t: { competency_id: number; t_start_ms: number }, i: number) => {
          const name = competencies.find((c: { id: number }) => c.id === t.competency_id)?.name || `ID ${t.competency_id}`;
          const startSec = Math.round(t.t_start_ms / 1000);
          const endSec = i < timeline.length - 1 ? Math.round(timeline[i + 1].t_start_ms / 1000) : null;
          return `- ~${startSec}s${endSec ? `-${endSec}s` : "+"}: ${name}`;
        })
        .join("\n");
      timelineContext = `\n\nThe evaluator was viewing these competencies at these approximate times during the recording:\n${timelineEntries}\n\nUse these timeline hints to help attribute parts of the transcript to the right competency, but rely primarily on content matching. The timeline is approximate.`;
    }

    const systemPrompt = `You are a coaching notes assistant for a healthcare performance evaluation system. Your job is to split an observation transcript into per-competency coaching notes.

The evaluator recorded verbal feedback while scrolling through competencies. You must:

1. Read the transcript and identify which parts relate to which competency
2. Write each note in polished, coach-style language:
   - Second person ("You demonstrated...", "Consider trying...", "Great job with...")
   - Clear, supportive, and professional tone
   - Fix grammar, remove filler words, false starts, and rambling
   - Keep each note to 2-4 concise sentences
   - Preserve specific examples and observations from the transcript
   - Do NOT fabricate information not present in the transcript
3. If no relevant content exists for a competency, omit it entirely (do not return empty notes)
4. Each competency should appear at most once in the output
5. Maximum 500 characters per note

Available competencies:
${competencyList}${timelineContext}`;

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
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Here is the observation transcript to split into per-competency notes:\n\n${transcript}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "map_notes",
                description:
                  "Return per-competency coaching notes extracted from the observation transcript.",
                parameters: {
                  type: "object",
                  properties: {
                    notes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          competency_id: {
                            type: "number",
                            description: "The competency ID this note belongs to",
                          },
                          note_text: {
                            type: "string",
                            description:
                              "Polished coaching note, 2-4 sentences, max 500 chars",
                          },
                        },
                        required: ["competency_id", "note_text"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["notes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "map_notes" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Validate: filter to only valid competency IDs, no duplicates, enforce max length
    const validIds = new Set(competencies.map((c: { id: number }) => c.id));
    const seenIds = new Set<number>();
    const validNotes = (result.notes || []).filter(
      (n: { competency_id: number; note_text: string }) => {
        if (!validIds.has(n.competency_id)) return false;
        if (seenIds.has(n.competency_id)) return false;
        if (!n.note_text?.trim()) return false;
        seenIds.add(n.competency_id);
        return true;
      }
    );

    // Truncate notes that exceed max length
    const finalNotes = validNotes.map(
      (n: { competency_id: number; note_text: string }) => ({
        competency_id: n.competency_id,
        note_text: n.note_text.slice(0, 500),
      })
    );

    return new Response(JSON.stringify({ notes: finalNotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("map-observation-notes error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
