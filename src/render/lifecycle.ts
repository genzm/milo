export interface Rendered {
  update: () => void;
  dispose: () => void;
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
    this.updates.forEach((update) => update());
  };

  dispose = () => {
    const disposals = this.disposals;
    this.disposals = [];
    this.updates = [];
    disposals.forEach((dispose) => dispose());
  };
}
