let shuttingDown = false;

export function isAppShuttingDown(): boolean {
  return shuttingDown;
}

export function setAppShuttingDown(state: boolean): void {
  shuttingDown = state;
}
