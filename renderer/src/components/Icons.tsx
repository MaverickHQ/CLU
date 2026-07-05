// Lucide icon sprite (per the design kit, docs/mockups/README.md). Inlined as
// <symbol> defs once at the app root; individual icons render via <use>.
// lucide-react can replace this when the icon count grows.

export function IconSprite(): React.JSX.Element {
  return (
    <svg style={{ display: 'none' }} xmlns="http://www.w3.org/2000/svg">
      <symbol id="i-folder" viewBox="0 0 24 24">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </symbol>
      <symbol id="i-folder-plus" viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </symbol>
      <symbol id="i-git-branch" viewBox="0 0 24 24">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </symbol>
      <symbol id="i-terminal" viewBox="0 0 24 24">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </symbol>
      <symbol id="i-file-text" viewBox="0 0 24 24">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </symbol>
      <symbol id="i-pin" viewBox="0 0 24 24">
        <line x1="12" y1="17" x2="12" y2="22" />
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
      </symbol>
      <symbol id="i-dot" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-chevron-right" viewBox="0 0 24 24">
        <polyline points="9 18 15 12 9 6" />
      </symbol>
      <symbol id="i-chevron-down" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9" />
      </symbol>
    </svg>
  )
}

export function Icon(props: { name: string; className?: string }): React.JSX.Element {
  return (
    <svg className={props.className ?? 'icon'} aria-hidden="true">
      <use href={`#${props.name}`} />
    </svg>
  )
}
