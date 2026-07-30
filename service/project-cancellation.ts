const projectControllers = new Map<string, Set<AbortController>>();

export function createProjectCancellation(projectId: string) {
  const controller = new AbortController();
  const controllers = projectControllers.get(projectId) ?? new Set<AbortController>();
  controllers.add(controller);
  projectControllers.set(projectId, controllers);
  return {
    signal: controller.signal,
    release: () => {
      controllers.delete(controller);
      if (controllers.size === 0) projectControllers.delete(projectId);
    },
  };
}

export function cancelProjectOperations(projectId: string) {
  const controllers = projectControllers.get(projectId);
  if (!controllers) return 0;
  for (const controller of controllers) controller.abort(new Error('项目客户端已关闭，运行已停止'));
  projectControllers.delete(projectId);
  return controllers.size;
}
