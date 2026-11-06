import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { cornerRadius, parseRadiusRatio, watchSlideCorners } from '../src/slide-radius.ts';

test('corner radius follows the shorter side', () => {
  assert.equal(cornerRadius(260, 119, 0.12), 14.28);
  assert.equal(cornerRadius(119, 260, 0.12), 14.28);
  assert.equal(cornerRadius(400, 200, 0.12), 24);
  assert.equal(cornerRadius(0, 100, 0.12), 0);
});

test('radius ratio accepts a percent or a fraction', () => {
  assert.equal(parseRadiusRatio('12%'), 0.12);
  assert.equal(parseRadiusRatio('0.12'), 0.12);
  assert.equal(parseRadiusRatio(''), 0.12);
});

test('laid-out cards receive a radius from their own shorter side', () => {
  const window = new Window();
  const previous = {
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    getComputedStyle: globalThis.getComputedStyle,
  };
  Object.assign(globalThis, {
    document: window.document,
    ResizeObserver: window.ResizeObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  window.document.documentElement.style.setProperty('--slide-radius-ratio', '12%');
  const root = window.document.createElement('div');
  window.document.body.append(root);
  root.innerHTML = `
    <div class="slide-card"></div>
    <div class="canvas-node canvas-shape-ellipse"></div>
    <div class="step-card"></div>
  `;
  const asElement = (selector: string) =>
    root.querySelector(selector) as unknown as HTMLElement;
  const size = (element: HTMLElement, width: number, height: number) => {
    Object.defineProperty(element, 'offsetWidth', { value: width });
    Object.defineProperty(element, 'offsetHeight', { value: height });
  };
  const card = asElement('.slide-card');
  const ellipse = asElement('.canvas-node');
  const step = asElement('.step-card');
  size(card, 260, 119);
  size(ellipse, 200, 80);
  size(step, 80, 200);
  const watched = watchSlideCorners(root as unknown as HTMLElement);
  watched.update();
  assert.equal(card.style.getPropertyValue('--slide-radius'), '14.28px');
  assert.equal(step.style.getPropertyValue('--slide-radius'), '9.6px');
  assert.equal(ellipse.style.getPropertyValue('--slide-radius'), '');
  watched.dispose();
  Object.assign(globalThis, previous);
  window.close();
});
