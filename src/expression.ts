export type Expr =
  | { type: 'number'; value: number }
  | { type: 'name'; name: string }
  | { type: 'unary'; op: string; arg: Expr }
  | { type: 'binary'; op: string; left: Expr; right: Expr }
  | { type: 'call'; name: string; args: Expr[] };
const functions: Record<string, { arity: number; fn: (...v: number[]) => number }> = {
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  exp: { arity: 1, fn: Math.exp },
  log: { arity: 1, fn: Math.log },
  sqrt: { arity: 1, fn: Math.sqrt },
  abs: { arity: 1, fn: Math.abs },
  min: { arity: 2, fn: Math.min },
  max: { arity: 2, fn: Math.max },
  pow: { arity: 2, fn: Math.pow },
};
type Token = { value: string; at: number };
export function parseExpression(source: string): Expr {
  if (source.length > 5000) throw new Error('式は5,000文字以内にしてください。');
  const tokens: Token[] = [];
  let p = 0;
  while (p < source.length) {
    if (/\s/.test(source[p])) {
      p++;
      continue;
    }
    const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z_][A-Za-z_0-9]*|^[+\-*/^(),]/.exec(
      source.slice(p),
    );
    if (!m) throw new Error(`式の ${p + 1} 文字目を解釈できません。`);
    tokens.push({ value: m[0], at: p });
    p += m[0].length;
  }
  let i = 0,
    depth = 0;
  const peek = () => tokens[i]?.value;
  function expr(min: number): Expr {
    if (++depth > 100) throw new Error('式の入れ子が深すぎます。');
    const token = tokens[i++];
    if (!token) throw new Error('式が途中です。');
    let left: Expr;
    const t = token.value;
    if (t === '+' || t === '-') left = { type: 'unary', op: t, arg: expr(25) };
    else if (t === '(') {
      left = expr(0);
      if (tokens[i++]?.value !== ')') throw new Error('閉じ括弧が必要です。');
    } else if (/^[\d.]/.test(t)) {
      const v = Number(t);
      if (!Number.isFinite(v)) throw new Error('数値が大きすぎます。');
      left = { type: 'number', value: v };
    } else if (/^[A-Za-z_]/.test(t)) {
      if (peek() === '(') {
        i++;
        const args: Expr[] = [];
        if (peek() !== ')') {
          do {
            if (peek() === ',') i++;
            args.push(expr(0));
          } while (peek() === ',');
        }
        if (tokens[i++]?.value !== ')') throw new Error('関数の閉じ括弧が必要です。');
        if (!Object.hasOwn(functions, t)) throw new Error(`使えない関数です: ${t}`);
        if (args.length !== functions[t].arity)
          throw new Error(`${t} の引数は ${functions[t].arity} 個です。`);
        left = { type: 'call', name: t, args };
      } else left = { type: 'name', name: t };
    } else throw new Error(`式の ${token.at + 1} 文字目を確認してください。`);
    while (true) {
      const op = peek(),
        prec = op === '+' || op === '-' ? 10 : op === '*' || op === '/' ? 20 : op === '^' ? 30 : -1;
      if (prec < min) break;
      i++;
      const right = expr(op === '^' ? prec : prec + 1);
      left = { type: 'binary', op, left, right };
    }
    depth--;
    return left;
  }
  const ast = expr(0);
  if (i !== tokens.length)
    throw new Error(`式の ${tokens[i].at + 1} 文字目に余分な要素があります。`);
  return ast;
}
export function evaluate(e: Expr, vars: Record<string, number>): number {
  switch (e.type) {
    case 'number':
      return e.value;
    case 'name':
      if (e.name === 'pi') return Math.PI;
      if (e.name === 'e') return Math.E;
      if (!Object.hasOwn(vars, e.name)) throw new Error(`未定義の変数: ${e.name}`);
      return vars[e.name];
    case 'unary':
      return (e.op === '-' ? -1 : 1) * evaluate(e.arg, vars);
    case 'call':
      return functions[e.name].fn(...e.args.map((a) => evaluate(a, vars)));
    case 'binary': {
      const a = evaluate(e.left, vars),
        b = evaluate(e.right, vars);
      switch (e.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        default:
          return a ** b;
      }
    }
  }
}
const greek = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'theta',
  'lambda',
  'mu',
  'sigma',
  'phi',
  'omega',
  'pi',
]);
export const nameTex = (s: string) =>
  greek.has(s) ? '\\' + s : s.length === 1 ? s : '\\mathrm{' + s.replace(/_/g, '\\_') + '}';
const par = (s: string) => `\\left(${s}\\right)`;
function precedence(e: Expr) {
  return e.type === 'binary'
    ? e.op === '+' || e.op === '-'
      ? 10
      : e.op === '*' || e.op === '/'
        ? 20
        : 30
    : e.type === 'unary'
      ? 25
      : 100;
}
export function toTex(e: Expr): string {
  if (e.type === 'number') return String(e.value);
  if (e.type === 'name') return nameTex(e.name);
  if (e.type === 'unary') return e.op + (precedence(e.arg) < 25 ? par(toTex(e.arg)) : toTex(e.arg));
  if (e.type === 'call') {
    const a = e.args.map(toTex);
    if (e.name === 'sqrt') return `\\sqrt{${a[0]}}`;
    if (e.name === 'abs') return `\\left|${a[0]}\\right|`;
    if (e.name === 'pow') return `{${par(a[0])}}^{${a[1]}}`;
    return `\\operatorname{${e.name}}${par(a.join(', '))}`;
  }
  if (e.op === '/') return `\\frac{${toTex(e.left)}}{${toTex(e.right)}}`;
  if (e.op === '^')
    return `{${precedence(e.left) <= 30 ? par(toTex(e.left)) : toTex(e.left)}}^{${toTex(e.right)}}`;
  const p = precedence(e),
    a = precedence(e.left) < p ? par(toTex(e.left)) : toTex(e.left);
  const b =
    precedence(e.right) < p || (e.op === '-' && precedence(e.right) === p)
      ? par(toTex(e.right))
      : toTex(e.right);
  return `${a} ${e.op === '*' ? '\\cdot' : e.op} ${b}`;
}
export interface Model {
  input: string;
  parameters: Record<string, number>;
  expression: string;
}
export function validateModel(m: any): Model {
  if (
    !m ||
    typeof m.input !== 'string' ||
    !/^[A-Za-z_][\w]*$/.test(m.input) ||
    typeof m.expression !== 'string' ||
    !m.parameters ||
    typeof m.parameters !== 'object' ||
    Array.isArray(m.parameters)
  )
    throw new Error('input・parameters・expression を指定してください。');
  for (const [k, v] of Object.entries(m.parameters))
    if (
      !/^[A-Za-z_][\w]*$/.test(k) ||
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      k === m.input ||
      k === 'pi' ||
      k === 'e'
    )
      throw new Error(`係数を確認してください: ${k}`);
  const ast = parseExpression(m.expression);
  evaluate(ast, { ...m.parameters, [m.input]: 0 });
  return m;
}
