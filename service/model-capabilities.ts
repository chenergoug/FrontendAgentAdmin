import type { ModelRecord } from './types.js';

export const defaultModelCapabilities = {
  structuredOutput: true,
  toolCalling: false,
  vision: false,
  streaming: true,
  reasoning: false,
  codeGeneration: true,
};

export const defaultModelExecution = {
  maxConcurrentRequests: 1,
  contextUsageRatio: 0.75,
  outputUsageRatio: 0.8,
};

type LegacyModelRecord = Omit<ModelRecord, 'capabilities' | 'execution' | 'capabilitySource' | 'capabilityCheckedAt'>
  & Partial<Pick<ModelRecord, 'capabilities' | 'execution' | 'capabilitySource' | 'capabilityCheckedAt'>>;

export function normalizeModelRecord(model: LegacyModelRecord): ModelRecord {
  const capabilities = { ...defaultModelCapabilities, ...(model.capabilities ?? {}) };
  const execution = { ...defaultModelExecution, ...(model.execution ?? {}) };
  return {
    ...model,
    capabilities: Object.fromEntries(
      Object.entries(defaultModelCapabilities).map(([key, fallback]) => [key, typeof capabilities[key as keyof typeof capabilities] === 'boolean' ? capabilities[key as keyof typeof capabilities] : fallback]),
    ) as ModelRecord['capabilities'],
    execution: {
      maxConcurrentRequests: Math.min(8, Math.max(1, Math.floor(Number(execution.maxConcurrentRequests) || 1))),
      contextUsageRatio: Math.min(0.9, Math.max(0.3, Number(execution.contextUsageRatio) || 0.75)),
      outputUsageRatio: Math.min(1, Math.max(0.3, Number(execution.outputUsageRatio) || 0.8)),
    },
    capabilitySource: model.capabilitySource ?? 'default',
    capabilityCheckedAt: model.capabilityCheckedAt ?? '',
  };
}

export function resolveModelExecutionProfile(modelInput: ModelRecord) {
  const model = normalizeModelRecord(modelInput);
  const contextReserve = Math.min(4096, Math.max(1024, Math.floor(model.contextWindow * 0.1)));
  const outputBudget = Math.max(512, Math.floor(Math.min(model.maxOutput, model.contextWindow * 0.25) * model.execution.outputUsageRatio));
  const inputBudget = Math.max(2048, Math.floor((model.contextWindow - contextReserve - outputBudget) * model.execution.contextUsageRatio));
  const mode = model.contextWindow <= 16000 || model.maxOutput <= 2000
    ? 'compact'
    : model.contextWindow <= 64000 || model.maxOutput <= 8000
      ? 'standard'
      : 'advanced';
  return {
    mode,
    inputBudget,
    outputBudget,
    timeoutSeconds: Math.max(10, model.timeout),
    maxConcurrentRequests: model.execution.maxConcurrentRequests,
    maxModulesPerAnalysis: mode === 'compact' ? 4 : mode === 'standard' ? 10 : 20,
    requireSchemaRepair: !model.capabilities.structuredOutput || mode === 'compact',
    allowParallelTasks: model.execution.maxConcurrentRequests > 1 && mode !== 'compact',
  } as const;
}
