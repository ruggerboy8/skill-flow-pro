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
    const { transcript, domains } = await req.json();

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

    // Build domain list for the prompt
    const domainList = domains
      .map((d: { domain_id: number; domain_name: string; pro_moves: string[] }) => {
        const moves = d.pro_moves.length > 0 ? ` (includes: ${d.pro_moves.slice(0, 5).join(", ")}${d.pro_moves.length > 5 ? "..." : ""})` : "";
        return `- Domain ${d.domain_id}: "${d.domain_name}"${moves}`;
      })
      .join("\n");

    const systemPrompt = `You are a coaching notes assistant for a clinical director performing a baseline assessment of a doctor. Your job is to split an assessment transcript into domain-level coaching notes.

The clinical director recorded verbal feedback while reviewing Pro Moves across multiple domains. You must:

1. Read the transcript and identify which parts relate to which domain
2. Write each domain note in a warm, conversational coaching tone:
   - Second person ("You showed strong skills in...", "I noticed you...")
   - Sound like a supportive clinical director — professional, encouraging, constructive
   - Fix grammar, remove filler words, false starts
   - Expand shorthand into clear sentences
   - Keep each domain note to 2-5 sentences
   - Preserve specific observations from the transcript
   - Do NOT fabricate information not in the transcript
3. If no relevant content exists for a domain, omit it entirely
4. Each domain should appear at most once in the output

Available domains:
${domainList}`;

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
            content: `Here is the clinical director's verbal feedback to split into domain-level notes:\n\n${transcript}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "map_domain_notes",
              description: "Return per-domain coaching notes extracted from the baseline assessment transcript.",
              parameters: {
                type: "object",
                properties: {
                  domain_notes: {
                    type: "object",
                    description: "Object keyed by domain_id (as string), with note text as value",
                    additionalProperties: { type: "string" },
                  },
                },
                required: ["domain_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "map_domain_notes" } },
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
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Validate: only keep valid domain IDs
    const validIds = new Set(domains.map((d: { domain_id: number }) => String(d.domain_id)));
    const validNotes: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.domain_notes || {})) {
      if (validIds.has(key) && typeof value === "string" && value.trim()) {
        validNotes[key] = (value as string).slice(0, 1000);
      }
    }

    return new Response(JSON.stringify({ domain_notes: validNotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("map-baseline-domain-notes error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
