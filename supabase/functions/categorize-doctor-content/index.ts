import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert Dental Clinical Coach helping structure professional development content for doctors.

Given a Pro Move statement and free-form instructions, categorize the content into four required fields:

1. **Why It Matters** (doctor_why): 2-4 sentences explaining the importance and impact of this behavior. Focus on patient safety, accuracy, and team efficiency.

2. **Scripting** (doctor_script): Specific phrases or dialogue the doctor should use. Format as quoted examples. If multiple examples, use bullet points with quotes.

3. **Gut Check Questions** (doctor_gut_check): 2-4 self-reflection questions the doctor can ask themselves to verify they're doing this correctly. Format as a markdown bulleted list starting each with "Did I..." or similar question format.

4. **What Good Looks Like** (doctor_good_looks_like): Observable behaviors or outcomes that indicate mastery. Format as a markdown bulleted list of concrete, observable actions.

Each value should be well-formatted markdown. Be concise but thorough.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proMoveStatement, rawInput } = await req.json();

    if (!proMoveStatement || !rawInput) {
      return new Response(
        JSON.stringify({ error: "proMoveStatement and rawInput are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = `Pro Move Statement: "${proMoveStatement}"

Free-form instructions from the clinical director:
${rawInput}

Please categorize this content into the four required fields.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "categorize_content",
            description: "Categorize doctor pro move content into four structured fields",
            parameters: {
              type: "object",
              properties: {
                doctor_why: { 
                  type: "string", 
                  description: "2-4 sentences explaining why this behavior matters" 
                },
                doctor_script: { 
                  type: "string", 
                  description: "Example phrases formatted as quoted examples" 
                },
                doctor_gut_check: { 
                  type: "string", 
                  description: "2-4 self-reflection questions as markdown bullets" 
                },
                doctor_good_looks_like: { 
                  type: "string", 
                  description: "Observable mastery behaviors as markdown bullets" 
                }
              },
              required: ["doctor_why", "doctor_script", "doctor_gut_check", "doctor_good_looks_like"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "categorize_content" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
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
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      throw new Error("AI did not return structured content");
    }

    const categorizedContent = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify(categorizedContent),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("categorize-doctor-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
