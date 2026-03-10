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

      // Identify which DOMAINS were active during recording (scroll detection is imprecise
      // at the card level, but reliable at the domain level since domains are large sections)
      const activeDomains = new Set<string>();
      for (const t of filteredTimeline) {
        const info = actionLookup.get(String(t.action_id));
        if (info) activeDomains.add(info.domain_name);
      }

      if (activeDomains.size > 0) {
        useTimeline = true;
        console.log("[map-baseline] Active domains from timeline:", [...activeDomains]);

        // Include ALL pro moves from the active domains
        for (const d of domains as DomainInput[]) {
          if (!activeDomains.has(d.domain_name)) continue;
          for (const pm of d.pro_moves || []) {
            const id = String(pm.action_id);
            targetActionIds.add(id);
            proMoveList.push(`- Action ${id}: "${pm.action_statement}" (Domain: ${d.domain_name})`);
          }
        }
        console.log("[map-baseline] Domain-scoped mode — sending", targetActionIds.size, "pro moves from", activeDomains.size, "domains");
      }
    }

    // Fallback: no usable timeline — send all pro moves
    if (!useTimeline) {
      console.log("[map-baseline] Fallback mode — no usable timeline, sending all pro moves");
      for (const [id, info] of actionLookup) {
        targetActionIds.add(id);
        proMoveList.push(`- Action ${id}: "${info.action_statement}" (Domain: ${info.domain_name})`);
      }
    }

    // -----------------------------------------------------------
    // Build prompt — always content-matching (timeline is too imprecise for forced splitting)
    // -----------------------------------------------------------
    const systemPrompt = `You are a coaching notes assistant for a clinical director performing a baseline assessment. Your job is to match parts of a verbal feedback transcript to the most relevant Pro Moves based on content.

Available Pro Moves:
${proMoveList.join("\n")}

Instructions:
1. Read the transcript and match each part to the Pro Move whose content it most closely relates to
2. Match based on MEANING — look for topic overlap between the feedback and each Pro Move's action statement
3. Write each note in a warm, conversational coaching tone:
   - Second person ("You showed strong skills in...", "I noticed you...")
   - Sound like a supportive clinical director — professional, encouraging, constructive
   - Fix grammar, remove filler words, false starts
   - Expand shorthand into clear sentences
   - Keep each note to 1-3 sentences
   - Preserve specific observations from the transcript
   - Do NOT fabricate information not in the transcript
4. Only map a note if the transcript content genuinely relates to that Pro Move
5. Each Pro Move should appear at most once in the output
6. Maximum 500 characters per note
7. Only use the action IDs listed above — do not invent new ones
8. You MUST return at least one note if the transcript contains any substantive feedback`;
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
              description: "Return coaching notes for each Pro Move discussed in the transcript. You MUST return at least one note.",
              parameters: {
                type: "object",
                properties: {
                  notes: {
                    type: "array",
                    description: "Array of notes, one per Pro Move that was discussed.",
                    items: {
                      type: "object",
                      properties: {
                        action_id: {
                          type: "string",
                          description: "The action_id of the Pro Move this note is for.",
                        },
                        note: {
                          type: "string",
                          description: "The coaching note for this Pro Move (1-3 sentences, max 500 chars).",
                        },
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

    console.log("[map-baseline] Raw tool_call arguments:", toolCall.function.arguments.slice(0, 1000));
    const result = JSON.parse(toolCall.function.arguments);
    const notesArray: { action_id: string; note: string }[] = result.notes || [];
    console.log("[map-baseline] AI returned", notesArray.length, "notes");

    // Convert array to validated map
    const validNotes: Record<string, string> = {};
    for (const item of notesArray) {
      const id = String(item.action_id);
      if (targetActionIds.has(id) && typeof item.note === "string" && item.note.trim()) {
        validNotes[id] = item.note.slice(0, 500);
      } else {
        console.log("[map-baseline] Filtered out:", id, "inTarget?", targetActionIds.has(id));
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
