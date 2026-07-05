// Viewer pane (task 3.6): read-only rendering routed by classifyFile.
// Markdown via react-markdown (+GFM, +highlighted fences); source via shiki
// (theme-matched to [data-theme], grammars lazy-loaded); plain as <pre>;
// binary / too-large / empty states per the mockups.

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { parentDir } from '@shared/paths'
import { useCockpit, useHost } from '../store/context'
import type { TabRuntime } from '../store/cockpit'
import { classifyFile, restoreTopLine, shikiTheme, type Classification } from '../viewer/classify'
import { Icon } from './Icons'

type ViewState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready'; cls: Classification; content: string; codeHtml?: string }
  | { status: 'error'; message: string }

export function ViewerPane(props: { tab: TabRuntime }): React.JSX.Element {
  const { tab } = props
  const host = useHost()
  const theme = useCockpit((s) => s.theme)
  const [view, setView] = useState<ViewState>({ status: 'empty' })
  const [reloadTick, setReloadTick] = useState(0)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const prevTopLine = useRef(0)
  const prevFile = useRef<string | null>(null)

  // Live refresh (task 3.7): a change to the open file re-reads it in place,
  // preserving scroll — "watch claude work".
  useEffect(() => {
    const file = tab.viewerFile
    if (!file) return
    const parent = parentDir(file)
    return host.watchDir(parent, (events) => {
      if (events.some((e) => e.path === file && e.type !== 'unlink')) {
        setReloadTick((t) => t + 1)
      }
    })
  }, [tab.viewerFile, host])

  useEffect(() => {
    const file = tab.viewerFile
    if (!file) {
      setView({ status: 'empty' })
      return
    }
    const sameFile = prevFile.current === file
    if (!sameFile && bodyRef.current) prevTopLine.current = 0
    prevFile.current = file

    let cancelled = false
    setView((v) => (v.status === 'ready' && sameFile ? v : { status: 'loading' }))
    void (async () => {
      try {
        const { content, sizeBytes, tooLarge } = await host.readFile(file)
        if (tooLarge) {
          // Main refused to read it (C3) — show the too-large panel directly.
          if (!cancelled) {
            setView({ status: 'ready', cls: { kind: 'too-large', sizeBytes }, content: '' })
          }
          return
        }
        const cls = classifyFile(file, sizeBytes, content)
        let codeHtml: string | undefined
        if (cls.kind === 'code') {
          const { codeToHtml } = await import('shiki')
          codeHtml = await codeToHtml(content, {
            lang: cls.language ?? 'text',
            theme: shikiTheme(theme),
          })
        }
        if (cancelled) return
        setView({ status: 'ready', cls, content, codeHtml })
        // Scroll preservation on same-file reload (watch-refresh, task 3.7).
        if (sameFile && bodyRef.current) {
          const lineHeight = 20
          const lines = content.split('\n').length
          const top = restoreTopLine(prevTopLine.current, lines)
          bodyRef.current.scrollTop = top * lineHeight
        }
      } catch (err) {
        if (!cancelled) setView({ status: 'error', message: String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab.viewerFile, theme, host, reloadTick])

  function onScroll(): void {
    if (bodyRef.current) prevTopLine.current = Math.round(bodyRef.current.scrollTop / 20)
  }

  const fileName = tab.viewerFile?.split('/').pop()

  return (
    <div className="viewer-pane" data-testid="viewer-pane">
      {tab.viewerFile && (
        <div className="viewer-header">
          <Icon name="i-file-text" className="icon icon-sm" />
          <span className="filename">{fileName}</span>
          <span className="path">{tab.viewerFile}</span>
        </div>
      )}
      <div className="viewer-body" ref={bodyRef} onScroll={onScroll}>
        {view.status === 'empty' && (
          <div className="viewer-empty" data-testid="viewer-empty">
            <Icon name="i-file-text" className="icon empty-icon" />
            <div className="title">No file open</div>
            <div className="hint">
              Select a file in the tree to preview it. Pin files with <code>Space</code> to feed
              them to <code>claude</code> via <code>$CLU_FILES</code>.
            </div>
          </div>
        )}
        {view.status === 'loading' && <div className="viewer-loading" />}
        {view.status === 'error' && (
          <div className="viewer-empty" data-testid="viewer-error">
            <div className="title">Couldn't read file</div>
            <div className="hint">{view.message}</div>
          </div>
        )}
        {view.status === 'ready' && view.cls.kind === 'markdown' && (
          <div className="markdown-body" data-testid="viewer-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {view.content}
            </ReactMarkdown>
          </div>
        )}
        {view.status === 'ready' && view.cls.kind === 'code' && (
          <div
            className="code-body"
            data-testid="viewer-code"
            // shiki output is trusted generated markup
            dangerouslySetInnerHTML={{ __html: view.codeHtml ?? '' }}
          />
        )}
        {view.status === 'ready' && view.cls.kind === 'plain' && (
          <pre className="plain-body" data-testid="viewer-plain">
            {view.content}
          </pre>
        )}
        {view.status === 'ready' && view.cls.kind === 'binary' && (
          <div className="viewer-empty" data-testid="viewer-binary">
            <div className="title">Binary file</div>
            <div className="hint">
              Detected non-printable bytes in the first 1&nbsp;KB. CLU doesn't render binaries
              inline.
            </div>
          </div>
        )}
        {view.status === 'ready' && view.cls.kind === 'too-large' && (
          <div className="viewer-empty" data-testid="viewer-too-large">
            <div className="title">File too large to render</div>
            <div className="hint">
              {(view.cls.sizeBytes / (1024 * 1024)).toFixed(1)} MB — v1.0 refuses files over 10 MB
              (50 MB for .log) to keep the viewer responsive.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
