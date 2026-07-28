import { randomUUID } from 'node:crypto';
import { nowText, storagePaths } from './config.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';
import type { RecoveryRecord } from './types.js';

export async function createRecoveryItem(input: Pick<RecoveryRecord, 'type' | 'projectName' | 'title' | 'detail' | 'severity'>) {
  const recovery = await readJson<RecoveryRecord[]>(storagePaths.recovery, []);
  const duplicate = recovery.find((item) => item.status === '待处理' && item.projectName === input.projectName && item.title === input.title && item.detail === input.detail);
  if (duplicate) return duplicate;
  const item: RecoveryRecord = { id: `r-${randomUUID()}`, status: '待处理', createdAt: nowText(), ...input };
  await writeJsonAtomic(dataPath(storagePaths.recovery), [item, ...recovery]);
  return item;
}
