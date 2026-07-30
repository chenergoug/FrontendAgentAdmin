import { createCipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storagePaths } from './config.js';
import { dataPath, readJson, writeJsonAtomic } from './storage.js';

type EncryptedProjectSecret = {
  projectId: string;
  databasePassword: string;
  iv: string;
  authTag: string;
};

async function readOrCreateKey() {
  const keyPath = dataPath(storagePaths.secretKey);
  try {
    const key = await readFile(keyPath);
    if (key.length === 32) return key;
  } catch {
    // Create the machine-local encryption key on first credential write.
  }
  const key = randomBytes(32);
  await mkdir(path.dirname(keyPath), { recursive: true });
  await writeFile(keyPath, key, { mode: 0o600 });
  await chmod(keyPath, 0o600).catch(() => undefined);
  return key;
}

export async function setProjectDatabasePassword(projectId: string, password: string) {
  const key = await readOrCreateKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const record: EncryptedProjectSecret = {
    projectId,
    databasePassword: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
  const secrets = await readJson<EncryptedProjectSecret[]>(storagePaths.projectSecrets, []);
  await writeJsonAtomic(dataPath(storagePaths.projectSecrets), [record, ...secrets.filter((item) => item.projectId !== projectId)]);
}

export async function hasProjectDatabasePassword(projectId: string) {
  const secrets = await readJson<EncryptedProjectSecret[]>(storagePaths.projectSecrets, []);
  return secrets.some((item) => item.projectId === projectId && Boolean(item.databasePassword));
}

export async function deleteProjectSecrets(projectId: string) {
  const secrets = await readJson<EncryptedProjectSecret[]>(storagePaths.projectSecrets, []);
  await writeJsonAtomic(dataPath(storagePaths.projectSecrets), secrets.filter((item) => item.projectId !== projectId));
}
