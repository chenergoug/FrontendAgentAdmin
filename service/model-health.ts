import { nowText } from './config.js';
import type { ModelRecord } from './types.js';

export async function checkModelHealth(model: ModelRecord): Promise<ModelRecord> {
  let healthy = false;
  if (model.type === '本地离线模型' && model.provider.toLowerCase().includes('ollama')) {
    try {
      const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      const data = (await response.json()) as { models?: { name?: string }[] };
      healthy = Boolean(data.models?.some((item) => item.name === model.modelId));
    } catch {
      healthy = false;
    }
  } else {
    try {
      const response = await fetch(model.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      healthy = response.ok || [400, 401, 403, 405].includes(response.status);
    } catch {
      healthy = false;
    }
  }
  return { ...model, healthy, checkedAt: nowText() };
}
