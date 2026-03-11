import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TimelineEntry {
  action_id: number;
  t_start_ms: number;
}

interface DomainInput {
  domain_name: string;
  pro_moves?: { action_id: number; action_statement: string }[];
}

/**
 * Build time-stamped segments from the click-based timeline.
 * Each segment has an action_id (0 = general/unattributed) and a time range.
 */
function buildSegments(timeline: TimelineEntry[], totalDurationHint?: number): { action_id: number; from_s: number; to_s: number }[] {
  if (!timeline.length) return [];
  const segments: { action_id: number; from_s: number; to_s: number }[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const fromS = Math.round(timeline[i].t_start_ms / 1000);
    const toS = i < timeline.length - 1
      ? Math.round(timeline[i + 1].t_start_ms / 1000)
      : (totalDurationHint ?? fromS + 300); // fallback: assume 5 min max
    if (toS > fromS) {
      segments.push({ action_id: timeline[i].action_id, from_s: fromS, to_s: toS });
    }
  }
  return segments;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[map-baseline] v3 — click-to-select deterministic splitting");
    const { transcript, domains, timeline } = await req.json();

    if (!transcript || !domains?.length) {
      return new Response(
        JSON.stringify({ error: "transcript and domains are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // Build action lookup
    const actionLookup = new Map<string, { action_statement: string; domain_name: string }>();
    for (const d of domains as DomainInput[]) {
      for (const pm of d.pro_moves || []) {
        actionLookup.set(String(pm.action_id), {
          action_statement: pm.action_statement,
          domain_name: d.domain_name,
        });
      }
    }

    const timelineArr = (timeline as TimelineEntry[] | undefined) ?? [];
    // Filter out action_id 0 (general/unattributed) segments for mapping
    const validTimeline = timelineArr.filter(t => t.action_id > 0);
    const segments = buildSegments(timelineArr);
    const validSegments = segments.filter(s => s.action_id > 0 && actionLookup.has(String(s.action_id)));

    console.log("[map-baseline] Timeline entries:", timelineArr.length, "valid segments:", validSegments.length);

    // ── Deterministic mode: timeline has valid entries ──
    if (validSegments.length > 0) {
      console.log("[map-baseline] Deterministic mode — splitting transcript by click-based segments");

      // Build a segment description for the AI
      const segmentLines = validSegments.map(s => {
        const info = actionLookup.get(String(s.action_id))!;
        return `- From ${formatTime(s.from_s)} to ${formatTime(s.to_s)}: Action ${s.action_id} "${info.action_statement}" (${info.domain_name})`;
      });

      const systemPrompt = `You are a coaching notes assistant. The clinical director recorded verbal feedback while explicitly selecting which Pro Move they were discussing at each point. The timeline below shows exactly when they were discussing each Pro Move.

Timeline of selections:
${segmentLines.join("\n")}

Instructions:
1. Split the transcript according to the timeline above. Each time range corresponds to a specific Pro Move.
2. For each segment, extract the relevant portion of the transcript and clean it up:
   - Second person voice ("You showed...", "I noticed you...")
   - Warm, professional coaching tone
   - Fix grammar, remove filler words and false starts
   - 1-3 sentences, max 500 characters
   - Preserve specific observations — do NOT fabricate
3. CRITICAL: If a segment is unclear or you cannot determine specific observations, include the verbatim transcript text for that time range rather than paraphrasing or restating the Pro Move statement. Never restate the Pro Move's action statement as a note — use the actual words from the transcript.
4. If a time segment has no substantive content at all (silence or completely unrelated), skip it
5. Only use the action IDs listed in the timeline`;

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
            { role: "user", content: `Transcript:\n\n${transcript}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "map_pro_move_notes",
                description: "Return cleaned coaching notes for each Pro Move segment.",
                parameters: {
                  type: "object",
                  properties: {
                    notes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          action_id: { type: "string" },
                          note: { type: "string" },
                        },
                        required: ["action_id", "note"],
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
          tool_choice: { type: "function", function: { name: "map_pro_move_notes" } },
        }),
      });

      return await processResponse(response, actionLookup, new Set(validSegments.map(s => String(s.action_id))));
    }

    // ── Fallback: no timeline — content-match all pro moves (legacy behavior) ──
    console.log("[map-baseline] Fallback mode — no timeline, using content matching");
    const proMoveList: string[] = [];
    const targetActionIds = new Set<string>();
    for (const [id, info] of actionLookup) {
      targetActionIds.add(id);
      proMoveList.push(`- Action ${id}: "${info.action_statement}" (Domain: ${info.domain_name})`);
    }

    const systemPrompt = `You are a coaching notes assistant for a clinical director performing a baseline assessment. Match parts of the transcript to the most relevant Pro Moves based on content.

Available Pro Moves:
${proMoveList.join("\n")}

Instructions:
1. Match each part of the transcript to the Pro Move whose content it most closely relates to
2. Write each note in a warm, conversational coaching tone (second person)
3. Fix grammar, remove filler words, 1-3 sentences, max 500 characters
4. Preserve specific observations — do NOT fabricate
5. Each Pro Move appears at most once
6. Return at least one note if the transcript contains substantive feedback
7. Only use action IDs listed above`;

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
          { role: "user", content: `Transcript:\n\n${transcript}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "map_pro_move_notes",
              description: "Return coaching notes for each Pro Move discussed.",
              parameters: {
                type: "object",
                properties: {
                  notes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action_id: { type: "string" },
                        note: { type: "string" },
                      },
                      required: ["action_id", "note"],
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
        tool_choice: { type: "function", function: { name: "map_pro_move_notes" } },
      }),
    });

    return await processResponse(response, actionLookup, targetActionIds);
  } catch (e) {
    console.error("[map-baseline] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function processResponse(
  response: Response,
  actionLookup: Map<string, { action_statement: string; domain_name: string }>,
  targetActionIds: Set<string>
): Promise<Response> {
  if (!response.ok) {
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const errorText = await response.text();
    console.error("[map-baseline] OpenAI API error:", response.status, errorText);
    throw new Error(`OpenAI API returned ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("[map-baseline] No tool call in response");
    throw new Error("No tool call response from AI");
  }

  const result = JSON.parse(toolCall.function.arguments);
  const notesArray: { action_id: string; note: string }[] = result.notes || [];
  console.log("[map-baseline] AI returned", notesArray.length, "notes");

  const validNotes: Record<string, string> = {};
  for (const item of notesArray) {
    const id = String(item.action_id);
    if (targetActionIds.has(id) && typeof item.note === "string" && item.note.trim()) {
      validNotes[id] = item.note.slice(0, 500);
    }
  }

  console.log("[map-baseline] Final valid notes:", Object.keys(validNotes).length);

  return new Response(JSON.stringify({ pro_move_notes: validNotes }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
