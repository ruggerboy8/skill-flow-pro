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

    // Build a flat list of pro moves with domain context
    const proMoveList: string[] = [];
    const validActionIds = new Set<string>();

    for (const d of domains) {
      for (const pm of (d.pro_moves || [])) {
        const id = String(pm.action_id);
        validActionIds.add(id);
        proMoveList.push(`- Action ${id}: "${pm.action_statement}" (Domain: ${d.domain_name})`);
      }
    }

    console.log("[map-baseline] Valid action IDs:", [...validActionIds]);

    // Build timeline context if available
    let timelineContext = "";
    if (timeline && timeline.length > 0) {
      const timelineEntries = timeline
        .map((t: { action_id: number; t_start_ms: number }, i: number) => {
          const startSec = Math.round(t.t_start_ms / 1000);
          const endSec = i < timeline.length - 1 ? Math.round(timeline[i + 1].t_start_ms / 1000) : null;
          return `- ~${startSec}s${endSec ? `-${endSec}s` : "+"}: Action ${t.action_id}`;
        })
        .join("\n");
      timelineContext = `\n\nThe clinical director was viewing these Pro Moves at these approximate times during the recording:\n${timelineEntries}\n\nUse these timeline hints to help attribute parts of the transcript to the right Pro Move, but rely primarily on content matching. The timeline is approximate.`;
      console.log("[map-baseline] Timeline context:", timelineContext);
    } else {
      console.log("[map-baseline] No timeline provided");
    }

    const systemPrompt = `You are a coaching notes assistant for a clinical director performing a baseline assessment of a doctor. Your job is to split an assessment transcript into per-Pro-Move coaching notes.

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
3. If a part of the transcript seems relevant to a Pro Move even loosely, include it — err on the side of mapping content rather than discarding it
4. If the transcript is general feedback not clearly tied to one Pro Move, distribute it to the most relevant Pro Move(s)
5. Each Pro Move should appear at most once in the output
6. Maximum 500 characters per note

Available Pro Moves:
${proMoveList.join("\n")}${timelineContext}`;

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
    console.log("[map-baseline] Raw AI result:", JSON.stringify(result.pro_move_notes || {}).slice(0, 500));

    // Validate: only keep valid action IDs
    const validNotes: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.pro_move_notes || {})) {
      if (validActionIds.has(key) && typeof value === "string" && value.trim()) {
        validNotes[key] = (value as string).slice(0, 500);
      } else {
        console.log("[map-baseline] Filtered out key:", key, "valid?", validActionIds.has(key), "type:", typeof value);
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
