// ADR-0007: shell integration baked into the spawn — no permanent user-config
// modification. CLU writes <root>/.clu/env.sh on every PinSet change; the
// shell sources it before each prompt via a hook installed here:
//   bash → spawn with --rcfile <tmp>/clu-bashrc.sh (sources ~/.bashrc first)
//   zsh  → spawn with ZDOTDIR=<tmp> whose .zshrc sources $ZDOTDIR-less config
//   other shells → not integrated; renderer falls back to quiet-moment typing.
//
// The hook is an if-statement (never a bare `[ ] &&`) so an rc with `set -e`
// survives a missing env file. This planner is PURE — main writes plan.files
// then spawns with plan.args/plan.env.

export interface ShellInitPlan {
  integrated: boolean
  /** Resolved shell basename (bash/zsh/fish/…), for the renderer fallback. */
  shell: string
  args: string[]
  env: Record<string, string>
  files: Array<{ path: string; content: string }>
}

/** Shared hook body: load $CLU_ENV_FILE if present; always exit 0. */
const HOOK_FN = [
  `_clu_load_env() {`,
  `  if [ -n "$CLU_ENV_FILE" ] && [ -f "$CLU_ENV_FILE" ]; then`,
  `    . "$CLU_ENV_FILE"`,
  `  fi`,
  `}`,
].join('\n')

export function prepareShellInit(opts: {
  shell: string
  home: string
  tmpDir: string
  /** The user's real $ZDOTDIR (where their zsh config lives), if set. Defaults
   *  to $home. Honoring it is finding F1 — a hardcoded ~/.zshrc left users with
   *  ZDOTDIR-based dotfiles on a bare prompt + broken PATH. */
  zdotdir?: string
}): ShellInitPlan {
  const name = opts.shell.split('/').pop() ?? opts.shell

  if (name === 'bash') {
    const rcPath = `${opts.tmpDir}/clu-bashrc.sh`
    const content = [
      `# CLU shell integration (ADR-0007) — temp rcfile, user config untouched.`,
      `[ -f "${opts.home}/.bashrc" ] && . "${opts.home}/.bashrc"`,
      HOOK_FN,
      `_clu_load_env`,
      // Prepend so user PROMPT_COMMANDs still run after ours.
      `PROMPT_COMMAND="_clu_load_env\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"`,
      '',
    ].join('\n')
    return { integrated: true, shell: name, args: ['--rcfile', rcPath], env: {}, files: [{ path: rcPath, content }] }
  }

  if (name === 'zsh') {
    // Point ZDOTDIR at our temp dir but faithfully replay the user's real zsh
    // startup: .zshenv (PATH/env — needed for `claude`) THEN .zshrc, from their
    // real config dir (F1). We provide both temp files so .zshenv is honored.
    const realZ = opts.zdotdir && opts.zdotdir !== '' ? opts.zdotdir : opts.home
    const zshenvPath = `${opts.tmpDir}/.zshenv`
    const zshenv = [
      `# CLU: replay the user's real .zshenv so PATH/env (and claude) resolve.`,
      `[ -f "${realZ}/.zshenv" ] && . "${realZ}/.zshenv"`,
      '',
    ].join('\n')
    const rcPath = `${opts.tmpDir}/.zshrc`
    const zshrc = [
      `# CLU shell integration (ADR-0007) — temp ZDOTDIR, user config untouched.`,
      `[ -f "${realZ}/.zshrc" ] && . "${realZ}/.zshrc"`,
      HOOK_FN,
      `_clu_load_env`,
      `precmd_functions+=(_clu_load_env)`,
      '',
    ].join('\n')
    return {
      integrated: true,
      shell: name,
      args: [],
      env: { ZDOTDIR: opts.tmpDir },
      files: [
        { path: zshenvPath, content: zshenv },
        { path: rcPath, content: zshrc },
      ],
    }
  }

  // sh/dash/ksh/fish/nu/pwsh: no baked integration — the renderer delivers
  // $CLU_FILES via the quiet-moment fallback instead (F4).
  return { integrated: false, shell: name, args: [], env: {}, files: [] }
}
