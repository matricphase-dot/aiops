import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: "https://api.x.ai/v1", // Grok API endpoint
});

export interface ChatMsg { role: "user" | "assistant"; content: any; }

export async function callClaude(opts: {
  system: string;
  messages: ChatMsg[];
  tools?: any[];
  maxTokens?: number;
}) {
  // Translate Anthropic tools to OpenAI tools
  const openAITools = opts.tools?.map((t: any) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  // Translate messages
  const openAIMessages = opts.messages.map((m: any) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    // Flatten Anthropic array blocks to string for Grok
    const text = Array.isArray(m.content)
      ? m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
      : String(m.content);
    return { role: m.role, content: text };
  });

  const res = await client.chat.completions.create({
    model: process.env.LLM_MODEL ?? "grok-beta",
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      { role: "system", content: opts.system },
      ...openAIMessages,
    ],
    tools: openAITools && openAITools.length > 0 ? openAITools : undefined,
  });

  const choice = res.choices[0].message;
  
  // Convert OpenAI response back to Anthropic format so graph.ts doesn't break
  const blocks: any[] = [];
  if (choice.content) {
    blocks.push({ type: "text", text: choice.content });
  }
  
  if (choice.tool_calls) {
    for (const tc of choice.tool_calls) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    }
  }

  return { content: blocks };
}