import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
export interface PairedBlock {
  source: string;
  options: string;
  error?: string;
}
export interface StepGroup {
  options: string;
  steps: { attrs: Record<string, string>; source: string }[];
  error?: string;
}
export interface ParsedDirective {
  name: string;
  attrs: Record<string, string>;
  error?: string;
}
export interface MiloBlocks {
  directives: ParsedDirective[];
  canvases: PairedBlock[];
  diagrams: PairedBlock[];
  boxes: PairedBlock[];
  panels: PairedBlock[];
  grids: PairedBlock[];
  stacks: PairedBlock[];
  steps: StepGroup[];
  columns: { sources: string[]; error?: string }[];
  impacts: PairedBlock[];
  footers: PairedBlock[];
}
export function lineText(state: StateBlock, line: number): string;
export function registerMiloBlocks(md: InstanceType<typeof MarkdownIt>): MiloBlocks;
