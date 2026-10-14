export function slideNumber(index: number, total: number) {
  return index === 0
    ? ''
    : `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

export function slideFrameMarkup(ids = false) {
  return `<div class="slide-top"><span class="slide-series"${ids ? ' id="slide-series"' : ''}></span></div><div${ids ? ' id="slide-content"' : ''} class="slide-content"></div>`;
}
