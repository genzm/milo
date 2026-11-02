const NS = 'http://www.w3.org/2000/svg';

export function svgElement(tag: string, attrs: Record<string, string | number>, text?: string) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
