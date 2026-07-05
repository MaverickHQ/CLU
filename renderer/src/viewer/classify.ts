// Viewer routing — pure functions (task 3.6). Extension first, content sniff
// for binaries, size limits per the design doc (10 MB, 50 MB for logs).

import type { ThemeName } from '@shared/types'

export type ViewKind = 'markdown' | 'code' | 'plain' | 'binary' | 'too-large'

export interface Classification {
  kind: ViewKind
  /** shiki language id when kind === 'code'. */
  language?: string
  sizeBytes: number
}

const MB = 1024 * 1024
export const MAX_BYTES = 10 * MB
export const MAX_LOG_BYTES = 50 * MB

const MARKDOWN_EXT = new Set(['md', 'markdown', 'mdx'])
const PLAIN_EXT = new Set(['txt', 'log'])

/** Extension → shiki language id (v1.0 set; shiki lazy-loads grammars). */
const CODE_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  go: 'go',
  py: 'python',
  rs: 'rust',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  java: 'java',
  rb: 'ruby',
  sql: 'sql',
  swift: 'swift',
  kt: 'kotlin',
  php: 'php',
  xml: 'xml',
  svelte: 'svelte',
  vue: 'vue',
}

export function extOf(path: string): string {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** >30% non-printable in the first 1 KB → binary (design doc sniff). */
export function isBinarySample(sample: string): boolean {
  const window = sample.slice(0, 1024)
  if (window.length === 0) return false
  let nonPrintable = 0
  for (const ch of window) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0) return true // NUL is a hard binary signal
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) nonPrintable++
  }
  return nonPrintable / window.length > 0.3
}

export function classifyFile(path: string, sizeBytes: number, sample: string): Classification {
  const ext = extOf(path)
  const limit = ext === 'log' ? MAX_LOG_BYTES : MAX_BYTES
  if (sizeBytes > limit) return { kind: 'too-large', sizeBytes }
  if (isBinarySample(sample)) return { kind: 'binary', sizeBytes }
  if (MARKDOWN_EXT.has(ext)) return { kind: 'markdown', sizeBytes }
  const language = CODE_LANG[ext]
  if (language) return { kind: 'code', language, sizeBytes }
  if (PLAIN_EXT.has(ext) || ext === '') return { kind: 'plain', sizeBytes }
  return { kind: 'plain', sizeBytes }
}

/** CLU theme → bundled shiki theme (ADR-0006). */
export function shikiTheme(theme: ThemeName): string {
  return theme === 'solarized-light' ? 'solarized-light' : 'tokyo-night'
}

/** Scroll preservation on reload: same line if it survives, clamp otherwise. */
export function restoreTopLine(prevTopLine: number, newLineCount: number): number {
  return Math.max(0, Math.min(prevTopLine, newLineCount - 1))
}
