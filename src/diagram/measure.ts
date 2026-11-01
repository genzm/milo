/** Untransformed CSS border-box size, including overflowing content.
 * getBoundingClientRect includes presentation zoom and diagram fit transforms;
 * scrollWidth/Height alone omit borders and round away subpixel dimensions.
 */
export function measureBorderBox(element: HTMLElement) {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const px = (value: string | undefined) => Number.parseFloat(value || '') || 0;
  const borderX = px(style?.borderLeftWidth) + px(style?.borderRightWidth);
  const borderY = px(style?.borderTopWidth) + px(style?.borderBottomWidth);
  const extraX =
    style?.boxSizing === 'border-box'
      ? 0
      : borderX + px(style?.paddingLeft) + px(style?.paddingRight);
  const extraY =
    style?.boxSizing === 'border-box'
      ? 0
      : borderY + px(style?.paddingTop) + px(style?.paddingBottom);
  return {
    width: Math.max(px(style?.width) + extraX, element.scrollWidth + borderX),
    height: Math.max(px(style?.height) + extraY, element.scrollHeight + borderY),
  };
}

export function sceneRatio(element: HTMLElement, width: number) {
  const cssWidth = Number.parseFloat(
    element.ownerDocument.defaultView?.getComputedStyle(element).width || '',
  );
  return width / (cssWidth || element.clientWidth || width);
}
