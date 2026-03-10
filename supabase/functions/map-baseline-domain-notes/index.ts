import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_DWELL_MS = 3000;

interface TimelineEntry {
  action_id: number;
  t_start_ms: number;
}

interface DomainInput {
  domain_name: string;
  pro_moves?: { action_id: number; action_statement: string }[];
}

/**
 * Filter timeline entries to only those where the coach paused ≥ MIN_DWELL_MS.
 * The last entry is always included (coach stopped recording while on it).
 */
function filterByDwell(timeline: TimelineEntry[]): TimelineEntry[] {
  if (timeline.length === 0) return [];
  if (timeline.length === 1) return timeline;

  const kept: TimelineEntry[] = [];
  for (let i = 0; i < timeline.length; i++) {
    if (i === timeline.length - 1) {
      // Last entry — always include (coach was on this when they stopped)
      kept.push(timeline[i]);
    } else {
      const dwell = timeline[i + 1].t_start_ms - timeline[i].t_start_ms;
      if (dwell >= MIN_DWELL_MS) {
        kept.push(timeline[i]);
      }
    }
  }
  return kept;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[map-baseline] v2 — dwell-filter + deterministic prompt");
    const { transcript, domains, timeline } = await req.json();

    console.log("[map-baseline] Received:", {
      transcriptLength: transcript?.length,
      domainCount: domains?.length,
      timelineLength: timeline?.length,
    });

    if (!transcript || !domains?.length) {
      return new Response(
        JSON.stringify({ error: "transcript and domains are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Build a lookup of all valid action_ids → their info
    const actionLookup = new Map<string, { action_statement: string; domain_name: string }>();
    for (const d of domains as DomainInput[]) {
      for (const pm of d.pro_moves || []) {
        actionLookup.set(String(pm.action_id), {
          action_statement: pm.action_statement,
          domain_name: d.domain_name,
        });
      }
    }

    console.log("[map-baseline] Total valid action IDs:", actionLookup.size);

    // -----------------------------------------------------------
    // Determine which pro moves to send to the AI
    // -----------------------------------------------------------
    let useTimeline = false;
    let filteredTimeline: TimelineEntry[] = [];
    const targetActionIds = new Set<string>();
    let proMoveList: string[] = [];

    if (timeline && timeline.length > 0) {
      filteredTimeline = filterByDwell(timeline as TimelineEntry[]);
      console.log("[map-baseline] Timeline entries:", timeline.length, "→ after dwell filter:", filteredTimeline.length);

      // Collect unique action IDs from filtered timeline
      for (const t of filteredTimeline) {
        const id = String(t.action_id);
        if (actionLookup.has(id)) {
          targetActionIds.add(id);
        }
      }

      if (targetActionIds.size > 0) {
        useTimeline = true;
        // Build ordered pro move list from filtered timeline (preserving discussion order)
        const seen = new Set<string>();
        for (const t of filteredTimeline) {
          const id = String(t.action_id);
          if (!seen.has(id) && actionLookup.has(id)) {
            seen.add(id);
            const info = actionLookup.get(id)!;
            proMoveList.push(`${proMoveList.length + 1}. Action ${id}: "${info.action_statement}" (Domain: ${info.domain_name})`);
          }
        }
        console.log("[map-baseline] Timeline-driven mode — sending", targetActionIds.size, "pro moves to AI");
      }
    }

    // Fallback: no usable timeline — send all pro moves (legacy behavior)
    if (!useTimeline) {
      console.log("[map-baseline] Fallback mode — no usable timeline, sending all pro moves");
      for (const [id, info] of actionLookup) {
        targetActionIds.add(id);
        proMoveList.push(`- Action ${id}: "${info.action_statement}" (Domain: ${info.domain_name})`);
      }
    }

    // -----------------------------------------------------------
    // Build prompt
    // -----------------------------------------------------------
    let systemPrompt: string;

    if (useTimeline) {
      // Deterministic prompt: we know exactly which pro moves were discussed, in order
      systemPrompt = `You are a coaching notes assistant. A clinical director recorded verbal feedback while viewing specific Pro Moves in order. Your job is to split the transcript into per-Pro-Move coaching notes.

The coach discussed these Pro Moves in this order:
${proMoveList.join("\n")}

Instructions:
1. The transcript follows the same order as the list above. Split the transcript so each segment maps to the corresponding Pro Move.
2. Write each note in a warm, conversational coaching tone:
   - Second person ("You showed strong skills in...", "I noticed you...")
   - Sound like a supportive clinical director — professional, encouraging, constructive
   - Fix grammar, remove filler words, false starts
   - Expand shorthand into clear sentences
   - Keep each note to 1-3 sentences
   - Preserve specific observations from the transcript
   - Do NOT fabricate information not in the transcript
3. If feedback for two adjacent Pro Moves blends together, use content meaning to determine the split
4. Each Pro Move should appear at most once in the output
5. Maximum 500 characters per note
6. Only use the action IDs listed above — do not invent new ones`;
    } else {
      // Legacy fallback prompt when no timeline is available
      systemPrompt = `You are a coaching notes assistant for a clinical director performing a baseline assessment of a doctor. Your job is to split an assessment transcript into per-Pro-Move coaching notes.

The clinical director recorded verbal feedback while scrolling through Pro Moves. You must:

1. Read the transcript and identify which parts relate to which Pro Move
2. Write each note in a warm, conversational coaching tone:
   - Second person ("You showed strong skills in...", "I noticed you...")
   - Sound like a supportive clinical director — professional, encouraging, constructive
   - Fix grammar, remove filler words, false starts
   - Expand shorthand into clear sentences
   - Keep each note to 1-3 sentences
   - Preserve specific observations from the transcript
   - Do NOT fabricate information not in the transcript
3. If a part of the transcript seems relevant to a Pro Move even loosely, include it
4. Each Pro Move should appear at most once in the output
5. Maximum 500 characters per note

Available Pro Moves:
${proMoveList.join("\n")}`;
    }

    console.log("[map-baseline] Prompt mode:", useTimeline ? "timeline-driven" : "fallback");
    console.log("[map-baseline] Transcript preview:", transcript.slice(0, 200));

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
          {
            role: "user",
            content: `Here is the clinical director's verbal feedback to split into per-Pro-Move notes:\n\n${transcript}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "map_pro_move_notes",
              description: "Return per-Pro-Move coaching notes extracted from the baseline assessment transcript.",
              parameters: {
                type: "object",
                properties: {
                  pro_move_notes: {
                    type: "object",
                    description: "Object keyed by action_id (as string), with note text as value. Map as many notes as possible from the transcript.",
                    additionalProperties: { type: "string" },
                  },
                },
                required: ["pro_move_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "map_pro_move_notes" } },
      }),
    });

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
      console.error("[map-baseline] No tool call in response:", JSON.stringify(data.choices?.[0]?.message));
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log("[map-baseline] Raw AI result keys:", Object.keys(result.pro_move_notes || {}));

    // Validate: only keep action IDs that were in our target set
    const validNotes: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.pro_move_notes || {})) {
      if (targetActionIds.has(key) && typeof value === "string" && value.trim()) {
        validNotes[key] = (value as string).slice(0, 500);
      } else {
        console.log("[map-baseline] Filtered out key:", key, "inTarget?", targetActionIds.has(key));
      }
    }

    console.log("[map-baseline] Final valid notes count:", Object.keys(validNotes).length);

    return new Response(JSON.stringify({ pro_move_notes: validNotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[map-baseline] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
