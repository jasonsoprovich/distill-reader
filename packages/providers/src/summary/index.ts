import type { db as DbInstance } from "@distill/db";
import type { SummaryProviderKind } from "@distill/shared";
import { resolveCredential } from "../credentials.js";
import { createAnthropicClient } from "./anthropic.js";
import { MAX_SINGLE_PASS_CHARS, chunkText } from "./chunk.js";
import { DEFAULT_SUMMARY_MODELS } from "./models.js";
import { createOllamaClient } from "./ollama.js";
import { createOpenAiClient } from "./openai.js";
import { SUMMARY_PROMPT_VERSION, SUMMARY_SYSTEM_PROMPT, buildMapPrompt, buildReduceUserContent, buildUserContent } from "./prompt.js";
import { SummaryProviderError, type ResolvedCredential, type SummaryClientResult, type SummaryProviderClient } from "./types.js";

export * from "./chunk.js";
export * from "./models.js";
export * from "./prompt.js";
export * from "./types.js";

type Db = typeof DbInstance;

function createClient(provider: SummaryProviderKind, credential: ResolvedCredential): SummaryProviderClient {
  switch (provider) {
    case "openai":
      if (!credential.apiKey) throw new SummaryProviderError(provider, "auth", "No OpenAI API key configured");
      return createOpenAiClient(credential.apiKey, credential.baseUrl);
    case "anthropic":
      if (!credential.apiKey) throw new SummaryProviderError(provider, "auth", "No Anthropic API key configured");
      return createAnthropicClient(credential.apiKey, credential.baseUrl);
    case "ollama":
      if (!credential.baseUrl) throw new SummaryProviderError(provider, "auth", "No Ollama base URL configured");
      return createOllamaClient(credential.baseUrl);
  }
}

async function mapReduceSummarize(
  client: SummaryProviderClient,
  title: string,
  text: string,
  model: string,
): Promise<SummaryClientResult> {
  const chunks = chunkText(text);
  const partSummaries: string[] = [];
  for (const chunk of chunks) {
    const part = await client.complete({ systemPrompt: buildMapPrompt(), userContent: chunk, model });
    partSummaries.push(part.content);
  }
  return client.complete({
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userContent: buildReduceUserContent(title, partSummaries),
    model,
  });
}

export interface GenerateSummaryOptions {
  db: Db;
  userId: string;
  provider: SummaryProviderKind;
  articleTitle: string;
  articleText: string;
  model?: string;
}

export interface GenerateSummaryResult {
  provider: SummaryProviderKind;
  model: string;
  content: string;
  promptVersion: string;
}

/**
 * Resolves the user's credential for `provider`, then summarizes
 * `articleText` — single-pass for short articles, map-reduce for long ones
 * (PLAN §6.2). Throws SummaryProviderError on any failure; callers must
 * surface it explicitly rather than swallowing it (PLAN §6.3).
 */
export async function generateSummary(opts: GenerateSummaryOptions): Promise<GenerateSummaryResult> {
  const credential = await resolveCredential(opts.db, opts.userId, opts.provider);
  if (!credential) {
    throw new SummaryProviderError(opts.provider, "auth", `No ${opts.provider} credential configured`);
  }

  const client = createClient(opts.provider, credential);
  const model = opts.model || DEFAULT_SUMMARY_MODELS[opts.provider];

  const result =
    opts.articleText.length > MAX_SINGLE_PASS_CHARS
      ? await mapReduceSummarize(client, opts.articleTitle, opts.articleText, model)
      : await client.complete({
          systemPrompt: SUMMARY_SYSTEM_PROMPT,
          userContent: buildUserContent(opts.articleTitle, opts.articleText),
          model,
        });

  return { provider: opts.provider, model: result.model, content: result.content, promptVersion: SUMMARY_PROMPT_VERSION };
}

/** The model that will be used for `provider` absent an explicit override — needed by callers before generation, to compute the cache key. */
export function resolveModel(provider: SummaryProviderKind, requestedModel?: string): string {
  return requestedModel || DEFAULT_SUMMARY_MODELS[provider];
}
