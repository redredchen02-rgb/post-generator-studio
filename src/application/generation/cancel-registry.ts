const controllers = new Map<string, AbortController>();

export function registerGenerationController(id: string, controller: AbortController): void {
  controllers.set(id, controller);
}

export function releaseGenerationController(id: string): void {
  controllers.delete(id);
}

export function cancelGenerationController(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) {
    return false;
  }
  controller.abort();
  controllers.delete(id);
  return true;
}

