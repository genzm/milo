import { atAttributes } from './attributes.mjs';
function lineText(state, line) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}
// Fenced code can contain literal closing markers without ending the block.
function* structuralLines(state, from, end) {
  let fence = '';
  for (let line = from; line < end; line++) {
    const text = lineText(state, line).trim();
    if (fence) {
      if (new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(text)) fence = '';
      continue;
    }
    const opening = /^(?:`{3,}|~{3,})/.exec(text);
    if (opening) {
      fence = opening[0];
      continue;
    }
    yield [line, text];
  }
}
function registerPairedBlock(md, name, blocks, config) {
  const opening = config.attributes
    ? new RegExp(`^@${name}(?:\\s+([\\s\\S]*))?\\s*$`)
    : new RegExp(`^@${name}$`);
  const closing = `@end${name}`;
  md.block.ruler.before('fence', `milo-${name}`, (state, line, end, silent) => {
    if (state.sCount[line] - state.blkIndent >= 4) return false;
    const match = opening.exec(lineText(state, line).trim());
    if (!match) return false;
    let finish = end,
      depth = 1;
    for (const [cursor, text] of structuralLines(state, line + 1, end)) {
      if (config.nested && opening.test(text)) depth++;
      else if (text === closing && --depth === 0) {
        finish = cursor;
        break;
      }
    }
    if (silent) return true;
    const token = state.push(`milo_${name}`, '', 0);
    token.meta = {
      index:
        blocks.push({
          source: finish < end ? state.src.slice(state.bMarks[line + 1], state.bMarks[finish]) : '',
          options: match[1] || '',
          ...(finish >= end ? { error: `${name}を閉じる ${closing} がありません。` } : {}),
        }) - 1,
    };
    const next = finish < end ? finish + 1 : end;
    token.meta.sources =
      finish < end ? [{ source: blocks[token.meta.index].source, line: line + 1 }] : [];
    token.map = [line, next];
    state.line = next;
    return true;
  });
  const tag = config.tag ?? 'div';
  md.renderer.rules[`milo_${name}`] = (
    tokens,
    index,
  ) => `<${tag} class="${config.className}" data-${name}="${tokens[index].meta.index}"></${tag}>
`;
}
function parseSteps(groups) {
  return (state, line, end, silent) => {
    const header = /^@steps(?:\s+([\s\S]*))?$/.exec(lineText(state, line).trim());
    if (state.sCount[line] - state.blkIndent >= 4 || !header) return false;
    let cursor = line + 1,
      depth = 1,
      stepStart = -1,
      stepAttrs = {},
      error = '';
    const steps = [];
    const flush = (at) => {
      if (stepStart < 0) return;
      steps.push({
        attrs: stepAttrs,
        line: stepStart,
        source: state.src.slice(state.bMarks[stepStart], state.bMarks[at]),
      });
      stepStart = -1;
    };
    for (const [structuralLine, text] of structuralLines(state, line + 1, end)) {
      cursor = structuralLine;
      if (/^@steps(?:\s|$)/.test(text)) {
        depth++;
        continue;
      }
      if (text === '@endsteps') {
        if (--depth === 0) {
          flush(cursor);
          break;
        }
        continue;
      }
      if (depth !== 1) continue;
      const step = /^@step(?:\s+([\s\S]*))?$/.exec(text);
      if (step) {
        flush(cursor);
        try {
          stepAttrs = atAttributes(step[1] || '');
        } catch (e) {
          error = e.message;
          break;
        }
        stepStart = cursor + 1;
      } else if (stepStart < 0 && text) {
        error = 'steps の内容は @step で囲んでください。';
        break;
      }
    }
    if (!error && depth > 0) cursor = end;
    if (silent) return true;
    if (!error && cursor >= end) error = 'stepsを閉じる @endsteps がありません。';
    if (!error && !steps.length) error = 'steps には1つ以上の @step が必要です。';
    const token = state.push('milo_steps', '', 0);
    token.meta = {
      index:
        groups.push({
          options: header[1] || '',
          steps,
          error: error || void 0,
        }) - 1,
    };
    token.meta.sources = steps.map(({ source, line: line2 }) => ({ source, line: line2 }));
    token.map = [line, cursor < end ? cursor + 1 : end];
    state.line = cursor < end ? cursor + 1 : end;
    return true;
  };
}
function args(raw) {
  const a = {};
  const leftovers = raw.replace(/([\w-]+)\s*=\s*"([^"\r\n]*)"/g, (_, k, v) => ((a[k] = v), ''));
  if (leftovers.trim())
    throw new Error('ディレクティブの設定は name="value" の形式で書いてください。');
  return a;
}
function registerMiloBlocks(md) {
  const directives = [];
  const canvases = [];
  const diagrams = [];
  const boxes = [];
  const panels = [];
  const grids = [];
  const stacks = [];
  const steps = [];
  const columns = [];
  const impacts = [];
  const footers = [];
  registerPairedBlock(md, 'box', boxes, {
    className: 'box-block slide-card',
    attributes: true,
    nested: true,
  });
  registerPairedBlock(md, 'panel', panels, {
    className: 'panel-block slide-card',
    attributes: true,
    nested: true,
  });
  registerPairedBlock(md, 'grid', grids, {
    className: 'grid-block',
    attributes: true,
    nested: true,
  });
  registerPairedBlock(md, 'stack', stacks, {
    className: 'stack-block',
    attributes: true,
    nested: true,
  });
  md.block.ruler.before('fence', 'milo-columns', (s, line, end, silent) => {
    if (s.sCount[line] - s.blkIndent >= 4 || lineText(s, line).trim() !== '@columns') return false;
    let cursor = line + 1,
      depth = 1,
      columnStart = -1,
      error = '';
    const sources = [];
    const bodies = [];
    for (const [structuralLine, text] of structuralLines(s, line + 1, end)) {
      cursor = structuralLine;
      if (text === '@columns') {
        depth++;
        continue;
      }
      if (text === '@endcolumns') {
        if (--depth === 0) {
          if (columnStart >= 0) error = 'columnを閉じる @endcolumn がありません。';
          break;
        }
        continue;
      }
      if (depth !== 1) continue;
      if (text === '@column') {
        if (columnStart >= 0) {
          error = 'columnを閉じる @endcolumn がありません。';
          break;
        }
        columnStart = cursor + 1;
      } else if (text === '@endcolumn') {
        if (columnStart < 0) {
          error = '@endcolumn に対応する @column がありません。';
          break;
        }
        sources.push(s.src.slice(s.bMarks[columnStart], s.bMarks[cursor]));
        bodies.push({ source: sources.at(-1), line: columnStart });
        columnStart = -1;
      } else if (columnStart < 0 && text) {
        error = '@columns の内容は @column で囲んでください。';
        break;
      }
    }
    if (!error && depth > 0) cursor = end;
    if (silent) return true;
    if (!error && cursor >= end) error = 'columnsを閉じる @endcolumns がありません。';
    if (!error && sources.length < 2) error = 'columnsには2つ以上の @column が必要です。';
    const token = s.push('milo_columns', '', 0);
    token.meta = { index: columns.push({ sources, error: error || void 0 }) - 1, sources: bodies };
    token.map = [line, cursor < end ? cursor + 1 : end];
    s.line = cursor < end ? cursor + 1 : end;
    return true;
  });
  md.renderer.rules.milo_columns = (
    tokens,
    index,
  ) => `<div class="columns-block" data-columns="${tokens[index].meta.index}"></div>
`;
  md.block.ruler.before('fence', 'milo-steps', parseSteps(steps), {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.milo_steps = (
    tokens,
    index,
  ) => `<div class="steps-block" data-steps="${tokens[index].meta.index}"></div>
`;
  registerPairedBlock(md, 'impact', impacts, { className: 'impact-block' });
  registerPairedBlock(md, 'footer', footers, { className: 'slide-footer-content', tag: 'footer' });
  registerPairedBlock(md, 'canvas', canvases, { className: 'milo-canvas', attributes: true });
  registerPairedBlock(md, 'diagram', diagrams, { className: 'milo-diagram', attributes: true });
  md.block.ruler.before('fence', 'milo-directive', (s, line, _end, silent) => {
    const text = s.src.slice(s.bMarks[line] + s.tShift[line], s.eMarks[line]);
    const match = /^::([a-z]+)\{(.*)\}\s*$/.exec(text);
    let name = match?.[1] || '',
      raw = match?.[2] || '',
      nextLine = line + 1;
    if (!name) return false;
    if (silent) return true;
    let item;
    try {
      item = {
        name,
        attrs: args(raw),
      };
    } catch (e) {
      item = { name, attrs: {}, error: e.message };
    }
    const token = s.push('milo_directive', '', 0);
    token.meta = { index: directives.push(item) - 1, directive: item };
    token.map = [line, nextLine];
    s.line = nextLine;
    return true;
  });
  md.renderer.rules.milo_directive = (
    tokens,
    index,
  ) => `<div class="live-block" data-live="${tokens[index].meta.index}"></div>
`;
  return {
    directives,
    canvases,
    diagrams,
    boxes,
    panels,
    grids,
    stacks,
    steps,
    columns,
    impacts,
    footers,
  };
}
export { lineText, registerMiloBlocks };
