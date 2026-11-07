import OpenAI from "openai";

const client = new OpenAI({
  apiKey: (process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || "") as string,
  baseURL: "https://api.x.ai/v1",
});

export interface ChatMsg { role: "user" | "assistant"; content: any; }

export async function callClaude(opts: {
  system: string;
  messages: any[]; // Relaxed type to avoid TS strictness errors
  tools?: any[];
  maxTokens?: number;
}) {
  const openAITools = opts.tools?.map((t: any) => ({
    type: "function" as const,
    function: {
      name: String(t.name),
      description: String(t.description),
      parameters: (t.input_schema as any) || {},
    },
  }));

  const openAIMessages = opts.messages.map((m: any) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const text = Array.isArray(m.content)
      ? m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
      : String(m.content);
    return { role: m.role, content: text };
  });

  const res = await client.chat.completions.create({
    model: (process.env.LLM_MODEL ?? "grok-beta") as string,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      { role: "system", content: opts.system },
      ...openAIMessages,
    ] as any,
    tools: openAITools as any,
  });

  const choice = res.choices[0].message;

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