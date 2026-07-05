// Cockpit shell per docs/mockups/cockpit-v1.html: tab strip on top; tree left,
// viewer top-right, terminal bottom. Panes hold placeholders until tasks
// 3.1/3.4/3.6 fill them. Split positions persist through the store.
//
// react-resizable-panels v4 API: Group (orientation, defaultLayout as an
// id→flex map, onLayoutChanged) + Panel(id) + Separator.

import { Group, Panel, Separator } from 'react-resizable-panels'
import { useCockpit } from '../store/context'
import { ConfirmClose } from './ConfirmClose'
import { GitignoreToast } from './GitignoreToast'
import { Icon } from './Icons'
import { TabStrip } from './TabStrip'
import { TerminalView } from './TerminalView'
import { TreePane } from './TreePane'
import { ViewerPane } from './ViewerPane'
import { Welcome } from './Welcome'

function MissingProjectPane(props: { tabId: string; projectPath: string }): React.JSX.Element {
  const closeTab = useCockpit((s) => s.closeTab)
  return (
    <div className="missing-project" data-testid="missing-project">
      <Icon name="i-folder" className="icon" />
      <div className="title">Project folder no longer exists</div>
      <div className="hint">
        <code>{props.projectPath}</code> isn't there anymore. Was it moved, renamed, or deleted?
      </div>
      <button className="btn-cancel" onClick={() => void closeTab(props.tabId)}>
        Close tab
      </button>
    </div>
  )
}

export function Cockpit(): React.JSX.Element {
  const tabs = useCockpit((s) => s.tabs)
  const activeTabId = useCockpit((s) => s.activeTabId)
  const setSplits = useCockpit((s) => s.setSplits)
  const active = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="cockpit">
      <TabStrip />
      <ConfirmClose />
      {active?.missing ? (
        <MissingProjectPane tabId={active.id} projectPath={active.projectPath} />
      ) : active ? (
        <div className="main-area" data-testid="cockpit-panes">
          <Group
            orientation="horizontal"
            defaultLayout={{ tree: active.splits.treePct, main: 100 - active.splits.treePct }}
            onLayoutChanged={(layout) =>
              setSplits(active.id, {
                treePct: layout['tree'] ?? active.splits.treePct,
                terminalPct: active.splits.terminalPct,
              })
            }
          >
            <Panel id="tree">
              <div className="pane pane-tree" data-testid="pane-tree">
                <TreePane key={active.id} tab={active} />
              </div>
            </Panel>
            <Separator className="resize-handle resize-handle-v" />
            <Panel id="main">
              <Group
                orientation="vertical"
                defaultLayout={{
                  viewer: 100 - active.splits.terminalPct,
                  terminal: active.splits.terminalPct,
                }}
                onLayoutChanged={(layout) =>
                  setSplits(active.id, {
                    treePct: active.splits.treePct,
                    terminalPct: layout['terminal'] ?? active.splits.terminalPct,
                  })
                }
              >
                <Panel id="viewer">
                  <div className="pane pane-viewer" data-testid="pane-viewer">
                    <ViewerPane tab={active} />
                  </div>
                </Panel>
                <Separator className="resize-handle resize-handle-h" />
                <Panel id="terminal">
                  <div className="pane pane-terminal" data-testid="pane-terminal">
                    {tabs
                      .filter((t) => !t.missing) // no PTY at a deleted cwd (C2)
                      .map((t) => (
                      <TerminalView
                        key={t.id}
                        tabId={t.id}
                        projectPath={t.projectPath}
                        visible={t.id === active.id}
                      />
                    ))}
                  </div>
                </Panel>
              </Group>
            </Panel>
          </Group>
        </div>
      ) : (
        <Welcome />
      )}
      {active && !active.missing && <GitignoreToast key={active.id} tab={active} />}
    </div>
  )
}
