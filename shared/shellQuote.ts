// POSIX single-quoting (ADR-0005). Proven in the v0 Go prototype: wrap in
// single quotes; embedded single quotes become '\'' (close, escaped ', reopen).
// Single quotes disable ALL expansion, so $, backticks, spaces are inert.

export function posixQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`
}

/** fish uses \' escapes inside single quotes rather than the POSIX dance. */
export function fishQuote(s: string): string {
  return `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}
