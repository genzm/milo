interface EditEffects {
  navigation: () => void;
  saveState: () => void;
  editor: () => void;
  render: () => void;
  save: () => void;
  cache: () => void;
}

// Keep the order and debounce intervals of edit side effects in one place.
export class EditUpdates {
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly effects: EditEffects) {}

  changed() {
    this.effects.navigation();
    this.effects.saveState();
    this.effects.editor();
    this.cancelRender();
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.effects.render();
    }, 220);
    this.effects.save();
    this.cancelCache();
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = null;
      this.effects.cache();
    }, 150);
  }

  cancelRender() {
    if (this.renderTimer !== null) clearTimeout(this.renderTimer);
    this.renderTimer = null;
  }

  cancelCache() {
    if (this.cacheTimer !== null) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
  }
}
