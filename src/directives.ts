import katex from 'katex';
// Components are intentionally disabled for now. Restore this import together
// with componentRenderer and its registry entry below to enable them again.
// import { ComponentRunner,sceneSVG } from './component';
import { evaluate, parseExpression, toTex, nameTex, validateModel, type Model } from './expression';
import { SourceStore, json } from './source';

export const esc = (s: any) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const fmt = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(3)).toString() : '—');
export function resolve(store: SourceStore, id: string, kind: string) {
  return store.blocks.has(id) ? id : `${kind}-${id}`;
}
export function assetURL(text: string): string {
  const match = /^mime:\s*(image\/(?:gif|png|jpeg|webp|svg\+xml))\r?\n\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('画像素材の形式を確認してください。');
  if (match[1] === 'image/svg+xml')
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(match[2]);
  const base64 = match[2].replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('画像データが不正です。');
  return `data:${match[1]};base64,${base64}`;
}
function normAssetPath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
export function resolveAssetRef(store: SourceStore, ref: string): string {
  const raw = ref.startsWith('asset:') ? ref.slice(6) : ref;
  if (!raw) throw new Error('画像の参照が空です。');
  if (store.blocks.has(raw)) return raw;
  const prefixed = raw.startsWith('asset-') ? raw : `asset-${raw}`;
  if (store.blocks.has(prefixed)) return prefixed;
  const n = normAssetPath(raw),
    base = n.split('/').pop() || n;
  let found = '';
  for (const b of store.list('asset')) {
    const name = normAssetPath(b.name);
    if (name === n || name.endsWith('/' + n) || name === base || name.split('/').pop() === base) {
      if (found && found !== b.id) throw new Error(`画像の参照が複数に一致します: ${ref}`);
      found = b.id;
    }
  }
  if (found) return found;
  throw new Error(`埋め込み画像が見つかりません: ${ref}`);
}

export interface RenderContext {
  store: SourceStore;
  present: () => boolean;
  parameters: (modelId: string, m: Model) => Record<string, number>;
  setParameter: (modelId: string, key: string, value: number) => void;
  inspect: (id: string) => void;
  renderInline?: (source: string) => string;
  renderMarkdown?: (source: string) => string;
  // componentState:Map<string,any>; // Components are currently disabled.
}
export interface Directive {
  name: string;
  attrs: Record<string, string>;
}
export interface MountedDirective {
  update?: () => void;
  dispose?: () => void;
}
export interface DirectiveRenderer {
  mount: (element: HTMLElement, directive: Directive, context: RenderContext) => MountedDirective;
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag: string, attrs: Record<string, any>, text?: string) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}
export function showError(el: HTMLElement, e: any) {
  el.classList.add('block-error');
  el.textContent = e.message || String(e);
}
export function model(ctx: RenderContext, id: string) {
  const key = resolve(ctx.store, id, 'model'),
    m = validateModel(json(ctx.store.get(key).text));
  return { id: key, m, p: ctx.parameters(key, m), ast: parseExpression(m.expression) };
}

const equationRenderer: DirectiveRenderer = {
  mount(el, d, ctx) {
    const modelId = d.attrs.model || 'wave';
    el.classList.add('equation-block');
    el.title = 'クリックしてモデルの式を編集';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'モデルの式を編集');
    const open = () => {
      if (!ctx.present()) ctx.inspect(resolve(ctx.store, modelId, 'model'));
    };
    el.onclick = open;
    el.onkeydown = (e) => {
      if (e.key === 'Enter') open();
    };
    return {
      update: () => {
        try {
          const { m, ast, p } = model(ctx, modelId);
          el.classList.remove('block-error');
          el.innerHTML =
            katex.renderToString(`f(${nameTex(m.input)}) = ${toTex(ast)}`, {
              displayMode: true,
              throwOnError: false,
              trust: false,
            }) +
            `<div class="parameter-summary">${Object.entries(p)
              .map(([k, v]) => `${esc(k)} = ${fmt(v)}`)
              .join(' &nbsp; · &nbsp; ')}</div>`;
        } catch (e) {
          showError(el, e);
        }
      },
    };
  },
};

const plotRenderer: DirectiveRenderer = {
  mount(el, d, ctx) {
    const modelId = d.attrs.model || 'wave',
      from = Number(d.attrs.from ?? 0),
      to = Number(d.attrs.to ?? 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      throw new Error('グラフの範囲を確認してください。');
    el.classList.add('plot-block');
    const svg = svgEl('svg', {
      viewBox: '0 0 880 292',
      role: 'img',
      'aria-label': '数式から計算したグラフ',
    }) as SVGSVGElement;
    const left = 50,
      right = 855,
      top = 24,
      bottom = 252,
      W = right - left,
      H = bottom - top;
    const grid = svgEl('g', { class: 'chart-grid' }),
      labels = svgEl('g', { class: 'chart-labels' });
    for (let i = 0; i <= 5; i++) {
      const x = left + (W * i) / 5;
      grid.append(svgEl('line', { x1: x, y1: top, x2: x, y2: bottom }));
      labels.append(
        svgEl(
          'text',
          { x, y: bottom + 25, 'text-anchor': 'middle' },
          fmt(from + ((to - from) * i) / 5),
        ),
      );
    }
    const yLabels: SVGElement[] = [];
    for (let i = 0; i <= 4; i++) {
      const y = top + (H * i) / 4;
      grid.append(svgEl('line', { x1: left, y1: y, x2: right, y2: y }));
      const t = svgEl('text', { x: left - 12, y: y + 4, 'text-anchor': 'end' });
      yLabels.push(t);
      labels.append(t);
    }
    const area = svgEl('path', { class: 'chart-area' }),
      path = svgEl('path', { class: 'chart-line' });
    const cursor = svgEl('g', { visibility: 'hidden' }),
      cross = svgEl('line', { class: 'chart-cursor', y1: top, y2: bottom }),
      dot = svgEl('circle', { r: 5, class: 'chart-dot' });
    cursor.append(cross, dot);
    svg.append(grid, area, path, labels, cursor);
    const caption = document.createElement('div');
    caption.className = 'chart-caption';
    caption.innerHTML = '<span class="probe-label"></span>';
    el.append(svg, caption);
    let scale = 1.15,
      last: ReturnType<typeof model> | null = null;
    const update = () => {
      try {
        const info = model(ctx, modelId);
        last = info;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= 300; i++) {
          const x = from + ((to - from) * i) / 300,
            y = evaluate(info.ast, { ...info.p, [info.m.input]: x });
          points.push({ x, y });
        }
        const finite = points.filter((p) => Number.isFinite(p.y));
        if (!finite.length) throw new Error('この範囲には有限の計算結果がありません。');
        scale = Math.max(0.05, ...finite.map((p) => Math.abs(p.y))) * 1.15;
        const Y = (v: number) => top + H / 2 - ((v / scale) * H) / 2;
        let line = '',
          segments: string[] = [];
        let active = false,
          firstX = 0,
          lastX = 0;
        for (const p of points) {
          const x = left + ((p.x - from) / (to - from)) * W;
          if (!Number.isFinite(p.y)) {
            if (active) segments.push(`L${lastX} ${Y(0)} L${firstX} ${Y(0)} Z`);
            active = false;
            continue;
          }
          const point = `${x.toFixed(2)} ${Y(p.y).toFixed(2)}`;
          line += (active ? 'L' : 'M') + point;
          if (!active) {
            segments.push(`M${x} ${Y(0)} L${point}`);
            firstX = x;
          } else segments.push('L' + point);
          active = true;
          lastX = x;
        }
        if (active) segments.push(`L${lastX} ${Y(0)} L${firstX} ${Y(0)} Z`);
        path.setAttribute('d', line);
        area.setAttribute('d', segments.join(' '));
        yLabels.forEach((t, i) => (t.textContent = fmt(scale * (1 - i / 2))));
        el.classList.remove('block-error');
      } catch (e: any) {
        path.setAttribute('d', '');
        area.setAttribute('d', '');
        caption.querySelector('.probe-label')!.textContent = e.message;
        el.classList.add('block-error');
        last = null;
      }
    };
    svg.addEventListener('pointermove', (e) => {
      if (!last) return;
      const r = svg.getBoundingClientRect(),
        x = Math.max(left, Math.min(right, ((e.clientX - r.left) / r.width) * 880)),
        t = from + ((x - left) / W) * (to - from);
      const y = evaluate(last.ast, { ...last.p, [last.m.input]: t });
      if (!Number.isFinite(y)) return;
      cursor.setAttribute('visibility', 'visible');
      cross.setAttribute('x1', String(x));
      cross.setAttribute('x2', String(x));
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(top + H / 2 - ((y / scale) * H) / 2));
      caption.querySelector('.probe-label')!.textContent =
        `${last.m.input} = ${fmt(t)}  ·  f = ${fmt(y)}`;
    });
    svg.addEventListener('pointerleave', () => {
      cursor.setAttribute('visibility', 'hidden');
      caption.querySelector('.probe-label')!.textContent = '';
    });
    return { update };
  },
};

const sliderRenderer: DirectiveRenderer = {
  mount(el, d, ctx) {
    const match = /^([\w-]+)\.([\w]+)$/.exec(d.attrs.param || '');
    if (!match) throw new Error('param="モデル.係数" を指定してください。');
    const min = Number(d.attrs.min ?? 0),
      max = Number(d.attrs.max ?? 1),
      step = Number(d.attrs.step ?? 0.01);
    if (![min, max, step].every(Number.isFinite) || max <= min || step <= 0)
      throw new Error('スライダーの範囲を確認してください。');
    el.classList.add('slider-block');
    el.innerHTML = `<label><span>${esc(d.attrs.label || match[2])}</span><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${esc(match[2])}"><output></output></label>`;
    const input = el.querySelector('input')!,
      out = el.querySelector('output')!;
    input.addEventListener('input', () =>
      ctx.setParameter(resolve(ctx.store, match[1], 'model'), match[2], Number(input.value)),
    );
    return {
      update: () => {
        try {
          const { p } = model(ctx, match[1]),
            value = p[match[2]];
          if (!Number.isFinite(value)) throw new Error('係数が未定義です。');
          input.value = String(value);
          out.textContent = fmt(value);
          input.disabled = false;
        } catch {
          input.disabled = true;
        }
      },
    };
  },
};

const imageRenderer: DirectiveRenderer = {
  mount(el, d, ctx) {
    const id = resolveAssetRef(ctx.store, d.attrs.asset || '');
    const img = document.createElement('img');
    img.src = assetURL(ctx.store.get(id).text);
    img.alt = d.attrs.alt || ctx.store.get(id).name;
    img.className = 'embedded-image';
    el.classList.add('image-block');
    el.append(img);
    if (d.attrs.caption) {
      const c = document.createElement('p');
      c.className = 'image-caption';
      c.textContent = d.attrs.caption;
      el.append(c);
    }
    img.addEventListener('dblclick', () => {
      if (!ctx.present()) ctx.inspect(id);
    });
    return {};
  },
};

/* Components are intentionally disabled, but the implementation is kept here
 * so it can be restored without reconstructing the Worker integration.
const componentRenderer:DirectiveRenderer={mount(el,d,ctx){
  const modelId=d.attrs.model||'wave',id=resolve(ctx.store,d.attrs.id||'phase','component'),code=ctx.store.get(id).text;
  el.classList.add('component-block');const view=document.createElement('div'),controls=document.createElement('div'),caption=document.createElement('div');controls.className='component-controls';caption.className='component-caption';caption.textContent='部品を起動中…';el.append(view,controls,caption);
  const runner=new ComponentRunner(code);let dead=false,renderSeq=0;
  const context=()=>{const {p}=model(ctx,modelId);return{params:p,session:ctx.componentState.get(id)||{}};};
  const render=async()=>{const seq=++renderSeq;try{const scene=await runner.view(context());if(dead||seq!==renderSeq)return;view.replaceChildren(sceneSVG(scene));caption.textContent=scene.caption||'JavaScriptで編集できる図';el.classList.remove('block-error');
    const specs=Array.isArray(scene.controls)?scene.controls.slice(0,12):[];
    if(controls.dataset.ids!==JSON.stringify(specs.map((s:any)=>s.id))){controls.replaceChildren();controls.dataset.ids=JSON.stringify(specs.map((s:any)=>s.id));
      for(const spec of specs){if(spec.type!=='range')continue;const label=document.createElement('label');label.innerHTML='<span></span><input type="range"><output></output>';label.querySelector('span')!.textContent=String(spec.label||spec.id);const input=label.querySelector('input')!;input.dataset.id=String(spec.id);input.setAttribute('aria-label',String(spec.label||spec.id));label.querySelector('output')!.textContent=fmt(Number(spec.value));
        input.addEventListener('input',async()=>{try{const action=await runner.update({id:spec.id,value:Number(input.value)},context());if(dead)return;if(action?.session&&typeof action.session==='object'){ctx.componentState.set(id,{...ctx.componentState.get(id),...action.session});}
          if(action?.parameter&&Number.isFinite(action.value))ctx.setParameter(resolve(ctx.store,modelId,'model'),String(action.parameter),action.value);await render();}catch(e:any){caption.textContent=e.message;}});controls.append(label);
      }
    }
    for(const spec of specs){const input=[...controls.querySelectorAll('input')].find(n=>n.dataset.id===String(spec.id));if(!input)continue;const min=Number(spec.min??0),max=Number(spec.max??1),step=Number(spec.step??.01),value=Number(spec.value??0);if(![min,max,step,value].every(Number.isFinite)||max<=min||step<=0)throw new Error('部品スライダーの値が不正です。');input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.parentElement!.querySelector('output')!.textContent=fmt(value);}
  }catch(e:any){if(dead)return;el.classList.add('block-error');caption.textContent=e.message+' 右の「部品」で修正できます。';}};
  return{update:()=>{void render();},dispose:()=>{dead=true;runner.dispose();}};
}};
*/

const directiveRenderers = new Map<string, DirectiveRenderer>([
  ['equation', equationRenderer],
  ['plot', plotRenderer],
  ['slider', sliderRenderer],
  ['image', imageRenderer],
  // ['component',componentRenderer] // Components are currently disabled.
]);
export function directiveRenderer(name: string) {
  return directiveRenderers.get(name);
}
