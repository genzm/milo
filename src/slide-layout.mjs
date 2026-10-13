export const LAYOUTS = Object.freeze(['cover', 'section', 'lab', 'media', 'essay']);
const MILO_COMMENT = /^(\s*<!--\s*milo:\s*)([\s\S]*?)(\s*-->)/;
const ATTRIBUTE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

export function slideLayout(text) {
  const comment = MILO_COMMENT.exec(text);
  if (!comment) return undefined;
  const attrs = {};
  const leftover = comment[2].trim().replace(ATTRIBUTE, (_, key, double, single, bare) => {
    attrs[key] = double ?? single ?? bare;
    return '';
  });
  if (leftover.trim()) throw new Error(`milo コメントを解釈できません: ${comment[2].trim()}`);
  const layout = attrs.layout;
  if (!layout) return undefined;
  if (!LAYOUTS.includes(layout)) throw new Error(`未対応のレイアウトです: ${layout}`);
  return layout;
}

export function setSlideLayout(text, layout) {
  if (!LAYOUTS.includes(layout)) throw new Error(`未対応のレイアウトです: ${layout}`);
  const comment = MILO_COMMENT.exec(text);
  if (!comment) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return `<!-- milo: layout=${layout} -->${eol}${eol}${text}`;
  }
  // Match complete attributes so names and quoted values containing "layout"
  // are preserved when changing the actual layout attribute.
  let replaced = false;
  const raw = comment[2];
  let next = raw.replace(ATTRIBUTE, (attribute, key, double, single) => {
    if (key !== 'layout') return attribute;
    replaced = true;
    const value =
      double !== undefined ? `"${layout}"` : single !== undefined ? `'${layout}'` : layout;
    return attribute.replace(/(=\s*)[\s\S]*$/, (_, prefix) => prefix + value);
  });
  if (!replaced) next = `${raw.trimEnd()}${raw.trim() ? ' ' : ''}layout=${layout}`;
  return (
    text.slice(0, comment.index) + comment[1] + next + comment[3] + text.slice(comment[0].length)
  );
}
