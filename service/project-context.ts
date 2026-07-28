import { readProjectFileContent, readProjectFileTree } from './project-files.js';
import type { ProjectFileNode, ProjectRecord } from './types.js';

const supportedExtensions = /\.(?:ts|tsx|js|jsx|vue|dart|json|css|scss|html|md|yml|yaml)$/i;
const lowPriorityFiles = /(?:lock|\.min\.|generated|snapshot)/i;
const maxContextCharacters = 60000;
const maxFileCharacters = 14000;

function collectFiles(nodes: ProjectFileNode[]) {
  const files: ProjectFileNode[] = [];
  const walk = (items: ProjectFileNode[]) => items.forEach((item) => item.type === 'file' ? files.push(item) : item.children && walk(item.children));
  walk(nodes);
  return files
    .filter((item) => supportedExtensions.test(item.path) && !lowPriorityFiles.test(item.path))
    .sort((a, b) => {
      const priority = (item: ProjectFileNode) => /(?:^|\/)(?:src|app|pages|components|api|service|types)(?:\/|$)/i.test(item.path) ? 0 : 1;
      return priority(a) - priority(b) || a.size - b.size;
    });
}

export async function buildProjectSourceContext(project: ProjectRecord) {
  const files = collectFiles(await readProjectFileTree(project));
  const chunks: string[] = [];
  let used = 0;
  for (const file of files) {
    if (used >= maxContextCharacters) break;
    try {
      const result = await readProjectFileContent(project, file.path);
      const available = Math.min(maxFileCharacters, maxContextCharacters - used);
      const content = result.content.slice(0, available);
      chunks.push(`--- ${result.path} (${result.language}${content.length < result.content.length ? '，已截断' : ''}) ---\n${content}`);
      used += content.length;
    } catch {
      // Unsupported or transiently unavailable files are omitted from the bounded context.
    }
  }
  return {
    text: chunks.join('\n\n'),
    includedFiles: chunks.length,
    totalFiles: files.length,
    truncated: chunks.length < files.length,
  };
}
