/* Components are intentionally disabled for now.
 * Remove this outer comment, then restore the commented integration points in
 * directives.ts, app.ts, seed.mjs, and the integration test to enable them.
const workerCode = `
let component;
self.onmessage = async ({data}) => {
  const {id, op, source, context, event} = data;
  try {
    if(op === 'init') {
      component = new Function('"use strict";\\n' + source + '\\nreturn { view: typeof view === "function" ? view : null, update: typeof update === "function" ? update : null };')();
      if(!component.view) throw new Error('function view(ctx) を定義してください。');
      self.postMessage({id, result:true}); return;
    }
    const result = op === 'view' ? await component.view(context) : component.update ? await component.update(event, context) : {};
    self.postMessage({id,result});
  } catch(e) { self.postMessage({id,error:e.message || String(e)}); }
};`;
export class ComponentRunner {
  private worker:Worker; private seq=0; private closed=false;
  private pending=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  ready:Promise<any>;
  constructor(source:string){
    const url=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
    this.worker=new Worker(url);URL.revokeObjectURL(url);
    this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};
    this.worker.onerror=e=>{e.preventDefault();this.dispose(e.message||'部品の実行に失敗しました。');};
    this.ready=this.send({op:'init',source});
  }
  private send(data:any):Promise<any>{
    if(this.closed)return Promise.reject(new Error('部品は停止しています。コードを修正すると再起動します。'));
    return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>this.dispose('部品の処理が1.5秒を超えたため停止しました。'),1500);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,...data});});
  }
  async view(context:any){await this.ready;return this.send({op:'view',context});}
  async update(event:any,context:any){await this.ready;return this.send({op:'update',event,context});}
  dispose(message='部品の表示を終了しました。'){if(this.closed)return;this.closed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}this.pending.clear();}
}
const SVG_NS='http://www.w3.org/2000/svg';
const tags=new Set(['g','path','circle','ellipse','rect','line','polyline','polygon','text']);
const attributes=new Set(['x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','d','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','font-size','font-weight','font-family','text-anchor','dominant-baseline']);
export function sceneSVG(scene:any):SVGSVGElement{
  if(!scene||!Array.isArray(scene.nodes))throw new Error('view は nodes 配列を返してください。');
  const svg=document.createElementNS(SVG_NS,'svg');
  const w=Number(scene.width??800),h=Number(scene.height??280);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>10000||h>10000)throw new Error('図のサイズが不正です。');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',String(scene.label||'インタラクティブな図'));
  let count=0;
  function node(n:any,depth:number):SVGElement{
    if(++count>1500||depth>25||!n||!tags.has(n.tag))throw new Error('図形の種類・数・入れ子を確認してください。');
    const el=document.createElementNS(SVG_NS,n.tag);
    for(const [k,v] of Object.entries(n.attrs??{}))if(attributes.has(k)){
      const s=String(v);if(s.length>80000||/url\s*\(|javascript:|https?:/i.test(s))throw new Error('外部参照を含む図形属性は使えません。');el.setAttribute(k,s);
    }
    if(n.text!==undefined)el.textContent=String(n.text).slice(0,10000);
    for(const child of n.children??[])el.append(node(child,depth+1));return el;
  }
  for(const n of scene.nodes)svg.append(node(n,0));return svg;
}
*/
