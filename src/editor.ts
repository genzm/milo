import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json as jsonLanguage } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, StateField, type Text } from '@codemirror/state';
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
} from '@codemirror/view';
import { normalize, type Block } from './source';

function hiddenSlideMetadata(doc: Text): DecorationSet {
  const match = /^(?:\s*<!--\s*milo:[\s\S]*?-->[ \t]*(?:\r?\n)?)/.exec(doc.toString());
  return match
    ? Decoration.set([Decoration.replace({}).range(0, match[0].length)])
    : Decoration.none;
}

const editorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
  ]),
];
const slideMarkdown = markdown({ completeHTMLTags: false });
const hiddenSlideMetadataField = StateField.define<DecorationSet>({
  create: (state) => hiddenSlideMetadata(state.doc),
  update: (decorations, transaction) =>
    transaction.docChanged ? hiddenSlideMetadata(transaction.newDoc) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});
export class SourceEditor {
  private view: EditorView | null = null;
  private syncing = false;

  mount(parent: HTMLElement, block: Block, onChange: (text: string) => void) {
    this.destroy();
    const state = EditorState.create({
      doc: block.text,
      extensions: [
        editorSetup,
        block.kind === 'slide' ? slideMarkdown : jsonLanguage(),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        ...(block.kind === 'slide' ? [hiddenSlideMetadataField] : []),
        EditorState.lineSeparator.of(block.text.includes('\r\n') ? '\r\n' : '\n'),
        EditorView.contentAttributes.of({ 'aria-label': block.name + ' のソース' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.syncing) onChange(update.state.sliceDoc());
        }),
      ],
    });
    this.view = new EditorView({ state, parent });
  }

  sync(text: string) {
    if (!this.view) return;
    const next = normalize(text),
      old = this.view.state.doc.toString();
    if (next === old) return;
    let from = 0;
    while (from < old.length && from < next.length && old[from] === next[from]) from++;
    let oldEnd = old.length,
      newEnd = next.length;
    while (oldEnd > from && newEnd > from && old[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    this.syncing = true;
    try {
      this.view.dispatch({ changes: { from, to: oldEnd, insert: next.slice(from, newEnd) } });
    } finally {
      this.syncing = false;
    }
  }

  destroy() {
    this.view?.destroy();
    this.view = null;
  }
}
