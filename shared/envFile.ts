// Renders the $CLU_FILES env file (ADR-0005 format) that the shell hook
// sources on each prompt (ADR-0007). Pure string rendering — the atomic write
// is Host.writeEnvFile.

import { fishQuote, posixQuote } from './shellQuote'

export interface EnvExport {
  /** Most-recently-opened viewer file ($CLU_FILE), or null. */
  file: string | null
  /** The PinSet, insertion-ordered ($CLU_FILES). */
  files: string[]
}

/** bash/zsh: array form so `for f in "${CLU_FILES[@]}"` iterates cleanly. */
export function renderPosixEnv(exp: EnvExport): string {
  return [
    `export CLU_FILE=${posixQuote(exp.file ?? '')}`,
    `CLU_FILES=(${exp.files.map(posixQuote).join(' ')})`,
    `export CLU_FILES`,
    '',
  ].join('\n')
}

/** fish translation (v1.5 ships the conf.d integration; the format is locked now). */
export function renderFishEnv(exp: EnvExport): string {
  return [
    `set -gx CLU_FILE ${fishQuote(exp.file ?? '')}`,
    `set -gx CLU_FILES ${exp.files.map(fishQuote).join(' ')}`.trimEnd(),
    '',
  ].join('\n')
}

/** Space-joined single var for shells without array support (fallback path). */
export function renderPlainEnvCommand(exp: EnvExport): string {
  return `export CLU_FILE=${posixQuote(exp.file ?? '')} CLU_FILES=${posixQuote(exp.files.join(' '))}`
}

/**
 * A single command line to TYPE into a non-integrated shell's PTY to deliver
 * $CLU_FILES (finding F4). fish gets its native `set -gx`; every other
 * non-array shell gets the space-joined POSIX form. bash/zsh don't use this
 * (they source env.sh via the ADR-0007 hook).
 */
export function fallbackEnvCommand(shell: string, exp: EnvExport): string {
  return shell === 'fish' ? renderFishEnv(exp).trim() : renderPlainEnvCommand(exp)
}
