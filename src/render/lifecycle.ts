export interface Rendered {
  update: () => void;
  dispose: () => void;
}

// Run every callback even if one throws, so one broken block cannot leave the
// others stale or leak their observers. The first error is rethrown afterwards.
function runAll(callbacks: (() => void)[]) {
  let failure: { error: unknown } | null = null;
  for (const callback of callbacks) {
    try {
      callback();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}

export class RenderScope implements Rendered {
  private updates: (() => void)[] = [];
  private disposals: (() => void)[] = [];

  add(rendered: Rendered) {
    this.updates.push(rendered.update);
    this.onDispose(rendered.dispose);
  }

  onDispose(dispose: () => void) {
    this.disposals.push(dispose);
  }

  update = () => {
    runAll(this.updates);
  };

  dispose = () => {
    const disposals = this.disposals;
    this.disposals = [];
    this.updates = [];
    runAll(disposals);
  };
}
