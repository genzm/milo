export function parseSemanticValue(raw: string | undefined, axis: 'x' | 'y', name: string): number {
  const value = (raw || '').trim();
  if (!value) throw new Error(`${name} を指定してください。`);
  const aliases: Record<string, number> =
    axis === 'x' ? { left: -1, center: 0, right: 1 } : { bottom: -1, middle: 0, top: 1, center: 0 };
  if (value in aliases) return aliases[value];
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(
      `${name} は数値か ${axis === 'x' ? 'left / center / right' : 'bottom / middle / top'} です。`,
    );
  if (number < -1 || number > 1) throw new Error(`${name} は -1 から 1 の範囲で指定してください。`);
  return number;
}

export function parseSemanticSpan(raw: string | undefined, axis: 'x' | 'y', name: string) {
  const value = (raw || '').trim();
  const parts = value.split(':').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new Error(`${name} は min:max で指定してください。`);
  const min = parseSemanticValue(parts[0], axis, name);
  const max = parseSemanticValue(parts[1], axis, name);
  if (min >= max) throw new Error(`${name} の範囲を確認してください。`);
  return { min, max };
}
