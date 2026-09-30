// Markdown highlighting does not need the HTML, CSS, or JavaScript grammars.
export function html() {
  return { support: [], language: { parser: undefined } };
}

export function htmlCompletionSource() {
  return null;
}
