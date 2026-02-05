import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTENT_TYPE_PROMPTS: Record<string, string> = {
  doctor_script: `Format this scripting content for doctors. Rules:
- Wrap each distinct example phrase or quote in a markdown blockquote (> )
- Separate multiple examples with blank lines
- If there's context or explanation before/after quotes, keep it as regular text
- Preserve the original meaning and wording
- Make it scannable and easy to reference quickly`,

  doctor_gut_check: `Format these gut check questions for doctors. Rules:
- Convert to a bulleted list using markdown (- )
- Ensure each item is phrased as a question (ending with ?)
- Use "Did I..." or "Was I..." or similar self-reflective phrasing where appropriate
- One question per bullet
- Remove redundant numbering or formatting`,

  doctor_good_looks_like: `Format these "what good looks like" behaviors. Rules:
- Convert to a bulleted list using markdown (- )
- Each bullet should be a specific, observable behavior
- Start each with an action verb when possible
- Keep items concise and scannable
- Remove redundant numbering or formatting`,

  doctor_why: `Format this "why it matters" explanation. Rules:
- Add paragraph breaks for readability (2-4 sentences per paragraph)
- Bold key concepts or phrases using **bold**
- Keep the tone professional and motivational
- Ensure the content flows logically`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { content, contentType } = await req.json();

    if (!content || !contentType) {
      return new Response(
        JSON.stringify({ error: "Missing content or contentType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typePrompt = CONTENT_TYPE_PROMPTS[contentType];
    if (!typePrompt) {
      return new Response(
        JSON.stringify({ error: `Unknown contentType: ${contentType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a content formatter for medical education materials. Your job is to take raw, unstructured text and format it into clean, readable markdown.

${typePrompt}

IMPORTANT:
- Only output the formatted content, nothing else
- Do not add introductions, explanations, or commentary
- Preserve all original information - do not add or remove content
- If the content is already well-formatted, return it as-is with minimal changes`;

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
          { role: "user", content: `Format this content:\n\n${content}` },
        ],
        temperature: 0.3, // Low temperature for consistent formatting
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const formatted = data.choices?.[0]?.message?.content?.trim();

    if (!formatted) {
      throw new Error("No content returned from OpenAI");
    }

    return new Response(
      JSON.stringify({ formatted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("format-pro-move-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
