function atAttributes(source) {
  const attributes = {};
  let rest = source.trim();
  const id = /^#([A-Za-z][\w-]*)/.exec(rest);
  if (id) {
    attributes.id = id[1];
    rest = rest.slice(id[0].length).trim();
  }
  const pattern = /^([\w-]+)(?:\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s}]+)))?/;
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) throw new Error(`設定の書き方を確認してください: ${rest}`);
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? 'true';
    rest = rest.slice(match[0].length).trim();
  }
  return attributes;
}
export { atAttributes };
