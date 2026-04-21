import { query } from "@anthropic-ai/claude-agent-sdk";

export interface AgentResult {
  result: string;
  numTurns: number;
  durationMs: number;
  costUsd: number;
  usage: { input: number; cacheCreation: number; cacheRead: number; output: number };
}

const WIKI_MOUNT = process.env.WIKI_MOUNT ?? "/mnt/wiki";
const MAX_TURNS = Number(process.env.AGENT_MAX_TURNS ?? 30);

export async function runAgent(prompt: string): Promise<AgentResult> {
  const started = Date.now();
  let result = "";
  let numTurns = 0;
  let costUsd = 0;
  let usage = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0 };

  const stream = query({
    prompt,
    options: {
      maxTurns: MAX_TURNS,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      cwd: WIKI_MOUNT,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        excludeDynamicSections: true,
      },
    },
  });

  for await (const msg of stream) {
    if (msg.type === "result") {
      const r = msg as Record<string, unknown>;
      result = (r.result as string) ?? "";
      numTurns = (r.num_turns as number) ?? 0;
      costUsd = (r.total_cost_usd as number) ?? 0;
      const u = r.usage as Record<string, number> | undefined;
      if (u) {
        usage = {
          input: u.input_tokens ?? 0,
          cacheCreation: u.cache_creation_input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
        };
      }
    }
  }

  return { result, numTurns, durationMs: Date.now() - started, costUsd, usage };
}
