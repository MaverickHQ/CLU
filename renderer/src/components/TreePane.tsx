// File-tree pane (react-arborist renderer over the pure tree model). Lazily
// loads directory listings through the Host; expansion + hidden-mode persist
// via the store; git decorations come from parsed porcelain.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'
import type { DirEntry } from '@shared/host'
import { basename, parentDir } from '@shared/paths'
import { useCockpit, useHost } from '../store/context'
import type { TabRuntime } from '../store/cockpit'
import { buildTree, parsePorcelain, relTo, statusFor, type TreeNode } from '../tree/model'
import { Icon } from './Icons'

/** Measure the wrapper so the virtualized tree fills the pane (jsdom-safe). */
function useSize(): { ref: React.RefObject<HTMLDivElement | null>; w: number; h: number } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 280, h: 800 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, w: size.w, h: size.h }
}

/** Pinned section (cockpit mockup): the canonical PinSet list above the tree. */
function PinnedSection(props: { tab: TabRuntime }): React.JSX.Element | null {
  const { tab } = props
  const setViewerFile = useCockpit((s) => s.setViewerFile)
  const unpin = useCockpit((s) => s.unpin)
  if (tab.pinSet.length === 0) return null
  return (
    <div className="pinned-section" data-testid="pinned-section">
      <div className="pinned-title">
        Pinned <span className="count">{tab.pinSet.length}</span>
      </div>
      {tab.pinSet.map((path) => {
        const stale = tab.stalePins?.includes(path)
        return (
          <div
            key={path}
            className={`pinned-row${stale ? ' stale' : ''}`}
            data-testid={`pinned-${basename(path)}`}
            onClick={() => setViewerFile(tab.id, path)}
          >
            <Icon name="i-dot" className={`icon icon-sm pin-dot${stale ? ' stale' : ''}`} />
            <span className="name">{basename(path)}</span>
            {stale && <span className="stale-mark">⚠</span>}
            <button
              className="unpin"
              aria-label={`Unpin ${basename(path)}`}
              onClick={(e) => {
                e.stopPropagation()
                unpin(tab.id, path)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Per-Project loaded-directory cache (keyed by projectPath). TreePane is keyed
// by the active Tab id, so switching Tabs unmounts/remounts it; without a cache
// each switch reloads the tree from scratch and shows a blank pane until the
// listDir IPC resolves. Seeding from this cache makes switching back instant;
// loadDir still refreshes in the background. Module-level so it survives the
// remount; bounded by the projects opened this session.
const treeCache = new Map<string, Map<string, DirEntry[]>>()

export function TreePane(props: { tab: TabRuntime }): React.JSX.Element {
  const { tab } = props
  const host = useHost()
  const setViewerFile = useCockpit((s) => s.setViewerFile)
  const toggleExpanded = useCockpit((s) => s.toggleExpanded)
  const cycleHidden = useCockpit((s) => s.cycleHidden)
  const pin = useCockpit((s) => s.pin)
  const unpin = useCockpit((s) => s.unpin)

  const [entriesByDir, setEntriesByDir] = useState<Map<string, DirEntry[]>>(new Map())
  const [gitMap, setGitMap] = useState<Map<string, 'M' | 'A' | '?'>>(new Map())
  const [selected, setSelected] = useState<{ id: string; isDir: boolean } | null>(null)
  const { ref, w, h } = useSize()

  const loadedDirs = useRef<Set<string>>(new Set())
  const loadDir = useCallback(
    async (dirPath: string): Promise<void> => {
      loadedDirs.current.add(dirPath)
      const entries = await host.listDir(dirPath)
      setEntriesByDir((prev) => {
        const next = new Map(prev).set(dirPath, entries)
        treeCache.set(tab.projectPath, next) // write-through so a re-mount is instant
        return next
      })
    },
    [host, tab.projectPath],
  )

  // Root + persisted-expanded dirs load on mount / tab change. Seed from the
  // per-Project cache first so switching back shows the tree instantly (no
  // blank), then refresh in the background.
  useEffect(() => {
    const cached = treeCache.get(tab.projectPath)
    setEntriesByDir(cached ?? new Map())
    loadedDirs.current = new Set(cached?.keys())
    void loadDir(tab.projectPath)
    for (const dir of tab.treeExpansion) void loadDir(dir)
    void host.gitStatus(tab.projectPath).then((raw) => setGitMap(parsePorcelain(raw)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.projectPath])

  // Live refresh (task 3.7): fs events re-list affected loaded dirs and
  // re-poll git status, so the tree tracks what claude is doing.
  useEffect(() => {
    return host.watchDir(tab.projectPath, (events) => {
      const toReload = new Set<string>()
      for (const ev of events) {
        const parent = parentDir(ev.path)
        if (loadedDirs.current.has(parent)) toReload.add(parent)
      }
      toReload.forEach((d) => void loadDir(d))
      void host.gitStatus(tab.projectPath).then((raw) => setGitMap(parsePorcelain(raw)))
    })
  }, [host, tab.projectPath, loadDir])

  const data = useMemo(
    () => buildTree(tab.projectPath, entriesByDir, tab.hiddenMode),
    [tab.projectPath, entriesByDir, tab.hiddenMode],
  )
  const initialOpen = useMemo(
    () => Object.fromEntries(tab.treeExpansion.map((p) => [p, true])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.projectPath],
  )

  function Node({ node, style }: NodeRendererProps<TreeNode>): React.JSX.Element {
    const rel = relTo(tab.projectPath, node.data.id)
    const code = statusFor(rel, node.data.isDir, gitMap)
    return (
      <div
        style={style}
        className={`tree-row${node.isSelected ? ' selected' : ''}`}
        data-testid={`tree-row-${node.data.name}`}
        onClick={() => {
          setSelected({ id: node.data.id, isDir: node.data.isDir })
          if (node.data.isDir) {
            node.toggle()
            toggleExpanded(tab.id, node.data.id)
            if (!entriesByDir.has(node.data.id)) void loadDir(node.data.id)
          } else {
            setViewerFile(tab.id, node.data.id)
          }
        }}
      >
        <span className="chevron">
          {node.data.isDir && (
            <Icon name={node.isOpen ? 'i-chevron-down' : 'i-chevron-right'} className="icon icon-xs" />
          )}
        </span>
        <Icon
          name={node.data.isDir ? 'i-folder' : 'i-file-text'}
          className={`icon icon-sm ${node.data.isDir ? 'ico-dir' : 'ico-file'}`}
        />
        <span className="name">{node.data.name}</span>
        {tab.pinSet.includes(node.data.id) && (
          <Icon
            name="i-dot"
            className={`icon icon-xs pin-dot${tab.stalePins?.includes(node.data.id) ? ' stale' : ''}`}
          />
        )}
        {code && (
          <span className={`git-status git-${code === '?' ? 'untracked' : code}`}>{code}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className="tree-pane"
      ref={ref}
      tabIndex={0}
      data-testid="tree-pane"
      onKeyDown={(e) => {
        if (e.key === '.') cycleHidden(tab.id)
        if (e.key === ' ' && selected && !selected.isDir) {
          e.preventDefault() // don't scroll the pane
          if (tab.pinSet.includes(selected.id)) unpin(tab.id, selected.id)
          else pin(tab.id, selected.id)
        }
      }}
    >
      <PinnedSection tab={tab} />
      <Tree<TreeNode>
        data={data}
        width={w}
        height={h}
        rowHeight={24}
        indent={14}
        openByDefault={false}
        initialOpenState={initialOpen}
        disableDrag
        disableEdit
        disableMultiSelection
      >
        {Node}
      </Tree>
    </div>
  )
}
