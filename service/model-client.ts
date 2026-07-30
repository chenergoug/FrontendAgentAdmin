import { generateWithOllama } from './ollama-client.js';
import type { ModelRecord } from './types.js';

type GenerateInput = {
  model: ModelRecord;
  system: string;
  prompt: string;
  json?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readableValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (depth > 4) return '';
  if (Array.isArray(value)) return value.map((item) => readableValue(item, depth + 1)).filter(Boolean).join('；');
  if (isRecord(value)) {
    for (const key of ['message', 'detail', 'reason', 'description', 'error_description', 'error', 'errors']) {
      const text = readableValue(value[key], depth + 1);
      if (text) return text;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function errorCode(value: unknown) {
  if (!isRecord(value)) return '';
  const nested = isRecord(value.error) ? value.error : value;
  return readableValue(nested.code ?? nested.type);
}

function completionUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, '');
  if (/\/(chat\/completions|responses)$/.test(normalized)) return normalized;
  if (/\/v1$/.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function completionText(payload: unknown) {
  const extract = (value: unknown, depth = 0): string => {
    if (depth > 6 || value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map((item) => extract(item, depth + 1)).filter(Boolean).join('\n');
    if (!isRecord(value)) return '';
    const choices = Array.isArray(value.choices) ? value.choices : [];
    const first = isRecord(choices[0]) ? choices[0] : undefined;
    const message = first && isRecord(first.message) ? first.message : undefined;
    for (const candidate of [
      message?.content,
      first?.text,
      value.output_text,
      value.response,
      value.content,
      value.text,
      value.result,
      value.output,
      value.data,
    ]) {
      const text = extract(candidate, depth + 1);
      if (text) return text;
    }
    return '';
  };
  return extract(payload);
}

export function normalizeModelError(error: unknown, model?: Pick<ModelRecord, 'name' | 'provider'>) {
  const detail = readableValue(error);
  if (detail && detail !== '[object Object]' && detail.startsWith('模型“')) return detail;
  const normalized = detail && detail !== '[object Object]' ? detail : '模型服务返回了无法识别的错误';
  return model ? `模型“${model.name}”（${model.provider}）调用失败：${normalized}` : normalized;
}

async function generateOpenAiCompatible(input: GenerateInput) {
  const endpoint = completionUrl(input.model.baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model.modelId,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
        max_tokens: input.model.maxOutput,
        ...(input.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(Math.max(10, input.model.timeout) * 1000),
    });
  } catch (error) {
    throw new Error(`模型“${input.model.name}”（${input.model.provider}）连接失败：${readableValue(error) || '网络请求失败'}；请求地址：${endpoint}`);
  }

  const payload = await readResponseBody(response);
  if (!response.ok) {
    const code = errorCode(payload);
    const detail = readableValue(payload) || response.statusText || '模型服务未提供错误详情';
    throw new Error(
      `模型“${input.model.name}”（${input.model.provider}）调用失败：HTTP ${response.status}${code ? `，错误码 ${code}` : ''}，${detail}；请求地址：${endpoint}`,
    );
  }
  const text = completionText(payload);
  if (!text) {
    throw new Error(`模型“${input.model.name}”（${input.model.provider}）响应成功但没有可用文本；响应摘要：${readableValue(payload).slice(0, 1000)}`);
  }
  return { text, meta: { provider: input.model.provider, endpoint } };
}

export async function generateWithModel(input: GenerateInput) {
  try {
    if (input.model.provider.toLowerCase().includes('ollama')) {
      return await generateWithOllama({
        baseUrl: input.model.baseUrl,
        modelId: input.model.modelId,
        system: input.system,
        prompt: input.prompt,
        contextWindow: input.model.contextWindow,
        timeoutSeconds: input.model.timeout,
        json: input.json,
      });
    }
    return await generateOpenAiCompatible(input);
  } catch (error) {
    throw new Error(normalizeModelError(error, input.model));
  }
}
