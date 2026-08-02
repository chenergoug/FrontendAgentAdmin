import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectRecord, ProjectTaskType } from './types.js';

type PackageManifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const scriptCandidates: Record<ProjectTaskType, string[]> = {
  dev: ['dev', 'start', 'serve', 'preview'],
  build: ['build', 'compile', 'package'],
  lint: ['lint', 'check'],
  test: ['test', 'test:unit', 'test:ci'],
};

function packageManager(rootPath: string) {
  if (existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(rootPath, 'bun.lockb')) || existsSync(path.join(rootPath, 'bun.lock'))) return 'bun';
  return 'npm';
}

function inDirectory(projectRoot: string, commandRoot: string, command: string) {
  if (path.resolve(projectRoot) === path.resolve(commandRoot)) return command;
  return `cd ${JSON.stringify(path.relative(projectRoot, commandRoot))} && ${command}`;
}

function readManifest(root: string) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    return null;
  }
}

function resolveNodeCommand(projectRoot: string, root: string, type: ProjectTaskType) {
  const manifest = readManifest(root);
  if (!manifest) return '';
  const manager = packageManager(root);
  const script = scriptCandidates[type].find((candidate) => manifest.scripts?.[candidate]);
  if (script) return inDirectory(projectRoot, root, `${manager} run ${script}`);

  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (type === 'dev' && dependencies.vite) return inDirectory(projectRoot, root, `${manager} exec vite`);
  if (type === 'dev' && dependencies.electron) return inDirectory(projectRoot, root, `${manager} exec electron .`);
  if (type === 'build' && dependencies.vite) return inDirectory(projectRoot, root, `${manager} exec vite build`);
  if (type === 'lint' && dependencies.eslint) return inDirectory(projectRoot, root, `${manager} exec eslint .`);
  if (type === 'test' && dependencies.vitest) return inDirectory(projectRoot, root, `${manager} exec vitest run`);
  return '';
}

function resolveKnownFramework(projectRoot: string, root: string, type: ProjectTaskType) {
  if (existsSync(path.join(root, 'pubspec.yaml'))) {
    const commands: Record<ProjectTaskType, string> = {
      dev: 'flutter run',
      build: process.platform === 'darwin' ? 'flutter build macos' : 'flutter build windows',
      lint: 'flutter analyze',
      test: 'flutter test',
    };
    return inDirectory(projectRoot, root, commands[type]);
  }
  if (existsSync(path.join(root, 'go.mod'))) {
    const commands: Record<ProjectTaskType, string> = { dev: 'go run .', build: 'go build ./...', lint: 'go vet ./...', test: 'go test ./...' };
    return inDirectory(projectRoot, root, commands[type]);
  }
  if (existsSync(path.join(root, 'pom.xml'))) {
    const commands: Record<ProjectTaskType, string> = { dev: 'mvn spring-boot:run', build: 'mvn package', lint: 'mvn verify -DskipTests', test: 'mvn test' };
    return inDirectory(projectRoot, root, commands[type]);
  }
  const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  if (existsSync(path.join(root, 'build.gradle')) || existsSync(path.join(root, 'build.gradle.kts'))) {
    const commands: Record<ProjectTaskType, string> = { dev: `${gradle} bootRun`, build: `${gradle} build`, lint: `${gradle} check`, test: `${gradle} test` };
    return inDirectory(projectRoot, root, commands[type]);
  }
  if (existsSync(path.join(root, 'manage.py'))) {
    const commands: Record<ProjectTaskType, string> = { dev: 'python manage.py runserver', build: 'python manage.py check --deploy', lint: 'python -m ruff check .', test: 'python manage.py test' };
    return inDirectory(projectRoot, root, commands[type]);
  }
  if (existsSync(path.join(root, 'index.html')) && type === 'dev') {
    return inDirectory(projectRoot, root, 'python -m http.server 5173');
  }
  return '';
}

export function resolveProjectCommand(project: ProjectRecord, type: ProjectTaskType, override?: string) {
  if (override?.trim()) return override.trim();
  const configured: Record<ProjectTaskType, string> = {
    dev: project.devCommand,
    build: project.buildCommand,
    lint: project.lintCommand,
    test: project.testCommand,
  };
  if (configured[type]?.trim()) return configured[type].trim();
  if (!project.rootPath || !existsSync(project.rootPath)) return '';

  const roots = [
    project.rootPath,
    path.join(project.rootPath, 'frontend'),
    path.join(project.rootPath, 'client'),
    path.join(project.rootPath, 'app'),
    project.serverRootPath ? path.resolve(project.rootPath, project.serverRootPath) : '',
    path.join(project.rootPath, 'backend'),
    path.join(project.rootPath, 'server'),
  ].filter(Boolean);

  for (const root of [...new Set(roots)]) {
    if (!existsSync(root)) continue;
    const command = resolveNodeCommand(project.rootPath, root, type) || resolveKnownFramework(project.rootPath, root, type);
    if (command) return command;
  }
  return '';
}
