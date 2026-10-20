export const SOURCE_TYPE = 'application/x-milo-source';
export const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\0/g, '&#0;');
export const decode = (s) =>
  s.replace(/&(?:amp|lt|#0);/g, (s) => (s === '&amp;' ? '&' : s === '&lt;' ? '<' : '\0'));
function attrEscape(s) {
  return s.replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c],
  );
}
export function serializeBlock(b, eol = '\n') {
  if (!/^[a-zA-Z][\w-]*$/.test(b.id)) throw new Error('不正なブロックIDです。');
  return `<script${eol}  type="${SOURCE_TYPE}"${eol}  id="${b.id}"${eol}  data-kind="${b.kind}"${eol}  data-name="${attrEscape(b.name)}"${eol}  data-codec="amp-lt-v1">${eol}${encode(b.text)}${eol}</script>`;
}
