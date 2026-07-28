import type { OllamaModelTag, OllamaStatus } from './types.js';

export const defaultOllamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

type OllamaTagsResponse = {
  models?: {
    name?: string;
    model?: string;
    modified_at?: string;
    size?: number;
  }[];
};

type OllamaGenerateResponse = {
  response?: string;
  done?: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || defaultOllamaBaseUrl).replace(/\/$/, '');
}

export async function listOllamaModels(baseUrl = defaultOllamaBaseUrl): Promise<OllamaModelTag[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Ollama tags request failed: ${response.status}`);
  }
  const data = (await response.json()) as OllamaTagsResponse;
  return (data.models ?? []).map((item) => ({
    name: item.name ?? item.model ?? '',
    model: item.model ?? item.name ?? '',
    modifiedAt: item.modified_at ?? '',
    size: item.size ?? 0,
  }));
}

export async function getOllamaStatus(baseUrl = defaultOllamaBaseUrl): Promise<OllamaStatus> {
  try {
    const models = await listOllamaModels(baseUrl);
    return {
      installed: true,
      running: true,
      version: '',
      baseUrl: normalizeBaseUrl(baseUrl),
      models,
    };
  } catch {
    return {
      installed: false,
      running: false,
      version: '',
      baseUrl: normalizeBaseUrl(baseUrl),
      models: [],
    };
  }
}

export async function generateWithOllama(input: {
  baseUrl?: string;
  modelId: string;
  system?: string;
  prompt: string;
  contextWindow?: number;
  timeoutSeconds?: number;
  json?: boolean;
}) {
  const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.modelId,
      system: input.system,
      prompt: input.prompt,
      stream: false,
      ...(input.json ? { format: 'json' } : {}),
      options: {
        num_ctx: input.contextWindow,
      },
    }),
    signal: AbortSignal.timeout(Math.max(10, input.timeoutSeconds ?? 120) * 1000),
  });

  const data = (await response.json().catch(() => ({}))) as OllamaGenerateResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Ollama generate request failed: ${response.status}`);
  }

  return {
    text: data.response ?? '',
    meta: {
      done: data.done ?? false,
      totalDuration: data.total_duration ?? 0,
      loadDuration: data.load_duration ?? 0,
      promptEvalCount: data.prompt_eval_count ?? 0,
      evalCount: data.eval_count ?? 0,
    },
  };
}
