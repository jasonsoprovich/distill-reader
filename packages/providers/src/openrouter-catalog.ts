import { readCapped, safeFetch } from "@distill/extract";
import { OPENROUTER_BASE_URL, type OpenRouterModelDTO, type OpenRouterModelKind } from "@distill/shared";

// GET /models is public (no API key needed) and identical for every user —
// cached in-process so picking a provider in Settings doesn't refetch
// OpenRouter's ~400-model catalog on every keystroke of the search combobox.
const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 15_000;

const cache = new Map<OpenRouterModelKind, { data: OpenRouterModelDTO[]; expiresAt: number }>();

// speech = actual TTS models; "audio" is a different OpenRouter modality
// (music generation, e.g. Lyria) — verified against the live API, not docs.
const OUTPUT_MODALITY: Record<OpenRouterModelKind, string> = {
  summary: "text",
  tts: "speech",
};

export class OpenRouterCatalogError extends Error {}

interface OpenRouterModelsResponse {
  data?: {
    id: string;
    name: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    supported_voices?: string[] | null;
  }[];
}

export async function fetchOpenRouterModels(kind: OpenRouterModelKind): Promise<OpenRouterModelDTO[]> {
  const cached = cache.get(kind);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let response: Response;
  try {
    response = await safeFetch(`${OPENROUTER_BASE_URL}/models?output_modalities=${OUTPUT_MODALITY[kind]}`, {
      timeoutMs: CATALOG_TIMEOUT_MS,
    });
  } catch (err) {
    throw new OpenRouterCatalogError(err instanceof Error ? err.message : "Failed to reach OpenRouter");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OpenRouterCatalogError(`OpenRouter model list request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const buf = await readCapped(response);
  const parsed = JSON.parse(buf.toString("utf-8")) as OpenRouterModelsResponse;

  const models: OpenRouterModelDTO[] = (parsed.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? 0,
      pricing: { prompt: m.pricing?.prompt ?? "0", completion: m.pricing?.completion ?? "0" },
      supportedVoices: kind === "tts" ? (m.supported_voices ?? null) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache.set(kind, { data: models, expiresAt: Date.now() + CATALOG_TTL_MS });
  return models;
}
