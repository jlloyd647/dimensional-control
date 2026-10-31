import { useCallback, useEffect, useRef, useState } from 'react'
import { scenarioRegistry, type ScenarioId } from './scenarios'
import {
  CHANNEL_NAME,
  createControlCommand,
  isPortalEvent,
  type ControlCommand,
  type PortalSnapshot,
} from './sync/protocol'
import './ControlConsole.css'

const CONNECTION_TIMEOUT_MS = 3500
const COMMAND_TIMEOUT_MS = 6000
const scenarios = Object.values(scenarioRegistry)

type PendingCommand = {
  id: string
  label: string
}

function ControlConsole() {
  const [connected, setConnected] = useState(false)
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastPortalMessageAt = useRef(0)
  const pendingTimer = useRef<number | null>(null)
  const pendingCommandId = useRef<string | null>(null)

  useEffect(() => {
    let channel: BroadcastChannel
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = channel
    } catch (error) {
      const message = error instanceof Error
        ? `Could not connect to portal: ${error.message}`
        : 'Could not open a portal connection.'
      window.setTimeout(() => setConnectionError(message), 0)
      return
    }

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isPortalEvent(event.data)) return

      lastPortalMessageAt.current = Date.now()
      setConnected(true)
      setConnectionError('')

      if (event.data.type === 'STATE_SNAPSHOT' || event.data.type === 'HEARTBEAT') {
        setSnapshot(event.data.snapshot)
      } else if (event.data.type === 'ACK' && event.data.commandId === pendingCommandId.current) {
        if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
        pendingTimer.current = null
        pendingCommandId.current = null
        setPendingCommand(null)
      } else if (event.data.type === 'ERROR') {
        if (event.data.commandId && event.data.commandId === pendingCommandId.current) {
          if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
          pendingTimer.current = null
          pendingCommandId.current = null
          setPendingCommand(null)
        }
        setConnectionError(event.data.message)
      }
    }

    const requestSnapshot = () => {
      const hello = createControlCommand({ type: 'HELLO' })
      channel.postMessage(hello)
    }

    requestSnapshot()
    const interval = window.setInterval(() => {
      requestSnapshot()
      const isConnected = Date.now() - lastPortalMessageAt.current < CONNECTION_TIMEOUT_MS
      setConnected((current) => current === isConnected ? current : isConnected)
    }, 1000)

    return () => {
      window.clearInterval(interval)
      channel.close()
      channelRef.current = null
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
    }
  }, [])

  const sendCommand = useCallback((command: ControlCommand, label: string, replacePending = false) => {
    const channel = channelRef.current
    if (!connected || !channel || (pendingCommandId.current !== null && !replacePending)) return

    if (replacePending) {
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
      pendingTimer.current = null
      pendingCommandId.current = null
      setPendingCommand(null)
    }

    try {
      channel.postMessage(command)
      pendingCommandId.current = command.messageId
      setPendingCommand({ id: command.messageId, label })
      setConnectionError('')
      pendingTimer.current = window.setTimeout(() => {
        if (pendingCommandId.current !== command.messageId) return
        pendingCommandId.current = null
        setPendingCommand(null)
        setConnectionError(`Portal did not acknowledge “${label}”. Check the portal window connection.`)
      }, COMMAND_TIMEOUT_MS)
    } catch (error) {
      setConnectionError(
        error instanceof Error ? `Command could not be sent: ${error.message}` : 'Command could not be sent.',
      )
    }
  }, [connected])

  const sendSimpleCommand = useCallback((
    type: Exclude<ControlCommand['type'], 'HELLO' | 'SELECT_SCENARIO' | 'SET_UNSTABLE'>,
    label: string,
  ) => sendCommand(createControlCommand({ type }), label), [sendCommand])

  const sendEmergencySeal = useCallback(() => {
    sendCommand(createControlCommand({ type: 'EMERGENCY_SEAL' }), 'Emergency seal', true)
  }, [sendCommand])

  const selectScenario = useCallback((scenarioId: ScenarioId) => {
    sendCommand(
      createControlCommand({ type: 'SELECT_SCENARIO', scenarioId }),
      `Select ${scenarioRegistry[scenarioId].name}`,
    )
  }, [sendCommand])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      ) {
        return
      }
      if (!(event.ctrlKey && event.altKey && event.shiftKey) || event.metaKey) return

      switch (event.key.toLowerCase()) {
        case 'p':
          event.preventDefault()
          sendSimpleCommand('START_SCENARIO', 'Play')
          break
        case 'c':
          event.preventDefault()
          sendSimpleCommand('CLOSE_PORTAL', 'Close portal')
          break
        case 'x':
          event.preventDefault()
          sendEmergencySeal()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sendEmergencySeal, sendSimpleCommand])

  const selectedScenario = snapshot ? scenarioRegistry[snapshot.selectedScenarioId] : null
  const actionDisabled = !connected || pendingCommand !== null

  return (
    <main className="console">
      <header className="console-header">
        <div>
          <p className="console-eyebrow">Dimensional Control / Operator Station</p>
          <h1>Portal Command</h1>
        </div>
        <div className={`connection-status${connected ? ' connection-status--connected' : ''}`} role="status">
          <span className="connection-status__light" />
          {connected ? 'PORTAL CONNECTED' : 'WAITING FOR PORTAL'}
        </div>
      </header>

      <div className="console-layout">
        <section className="console-card console-card--status" aria-labelledby="portal-status-heading">
          <div className="console-card__heading">
            <div>
              <p className="console-eyebrow">Authoritative display report</p>
              <h2 id="portal-status-heading">Portal status</h2>
            </div>
            <span className={`state-badge state-badge--${snapshot?.portalState.toLowerCase() ?? 'offline'}`}>
              {snapshot?.portalState ?? 'OFFLINE'}
            </span>
          </div>
          <dl className="status-list">
            <div>
              <dt>Selected encounter</dt>
              <dd>{selectedScenario?.name ?? 'Awaiting portal report'}</dd>
            </div>
            <div>
              <dt>Video</dt>
              <dd>{snapshot?.videoStatus ?? '—'}</dd>
            </div>
            <div>
              <dt>Calibration grid</dt>
              <dd>{snapshot ? (snapshot.calibrationVisible ? 'Visible' : 'Hidden') : '—'}</dd>
            </div>
            <div>
              <dt>Portal stability</dt>
              <dd>{snapshot ? (snapshot.unstable ? 'Unstable' : 'Stable') : '—'}</dd>
            </div>
          </dl>
          {!connected && (
            <p className="console-note">
              Open <code>/portal</code> in another tab or window on this origin. The console will reconnect automatically.
            </p>
          )}
        </section>

        <section className="console-card" aria-labelledby="scenario-heading">
          <div className="console-card__heading">
            <div>
              <p className="console-eyebrow">Encounter library</p>
              <h2 id="scenario-heading">Select a scenario</h2>
            </div>
          </div>
          <div className="scenario-list">
            {scenarios.map((scenario) => {
              const isSelected = snapshot?.selectedScenarioId === scenario.id
              return (
                <button
                  className={`scenario-choice${isSelected ? ' scenario-choice--selected' : ''}`}
                  key={scenario.id}
                  type="button"
                  disabled={actionDisabled}
                  aria-pressed={isSelected}
                  onClick={() => selectScenario(scenario.id)}
                >
                  <span className="scenario-choice__name">{scenario.name}</span>
                  <span className="scenario-choice__description">{scenario.description}</span>
                  <span className="scenario-choice__state">{isSelected ? 'SELECTED' : 'SELECT'}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="console-card" aria-labelledby="actions-heading">
          <div className="console-card__heading">
            <div>
              <p className="console-eyebrow">Playback control</p>
              <h2 id="actions-heading">Portal actions</h2>
            </div>
          </div>
          <div className="action-grid">
            <button
              className="console-button console-button--primary"
              type="button"
              disabled={actionDisabled || !snapshot}
              onClick={() => sendSimpleCommand('START_SCENARIO', 'Play')}
            >
              Play
              <kbd>Ctrl+Alt+Shift+P</kbd>
            </button>
            <button
              className="console-button"
              type="button"
              disabled={actionDisabled || !snapshot}
              onClick={() => sendSimpleCommand('START_SCENARIO', 'Replay')}
            >
              Replay
            </button>
            <button
              className="console-button"
              type="button"
              disabled={actionDisabled || !snapshot || snapshot.portalState === 'CLOSED'}
              onClick={() => sendSimpleCommand('CLOSE_PORTAL', 'Close portal')}
            >
              Close Portal
              <kbd>Ctrl+Alt+Shift+C</kbd>
            </button>
            <button
              className="console-button console-button--danger"
              type="button"
              disabled={!connected}
              onClick={sendEmergencySeal}
            >
              Emergency Seal
              <kbd>Ctrl+Alt+Shift+X</kbd>
            </button>
            <button
              className="console-button"
              type="button"
              disabled={actionDisabled || !snapshot}
              onClick={() => sendSimpleCommand('TOGGLE_CALIBRATION', 'Toggle calibration')}
            >
              {snapshot?.calibrationVisible ? 'Hide calibration grid' : 'Show calibration grid'}
            </button>
            <button
              className="console-button"
              type="button"
              disabled={actionDisabled || !snapshot}
              onClick={() => {
                if (!snapshot) return
                sendCommand(
                  createControlCommand({ type: 'SET_UNSTABLE', enabled: !snapshot.unstable }),
                  snapshot.unstable ? 'Stabilize portal' : 'Make portal unstable',
                )
              }}
            >
              {snapshot?.unstable ? 'Stabilize Portal' : 'Set Unstable'}
            </button>
          </div>
          {pendingCommand && (
            <p className="console-feedback" role="status">
              Waiting for portal to acknowledge: {pendingCommand.label}…
            </p>
          )}
        </section>

        <section className="console-card console-card--alerts" aria-labelledby="alerts-heading">
          <div className="console-card__heading">
            <div>
              <p className="console-eyebrow">Operator feedback</p>
              <h2 id="alerts-heading">Messages</h2>
            </div>
          </div>
          {connectionError ? (
            <p className="console-alert" role="alert">{connectionError}</p>
          ) : snapshot?.error ? (
            <p className="console-alert" role="alert">{snapshot.error}</p>
          ) : (
            <p className="console-note">No playback or connection errors reported.</p>
          )}
        </section>
      </div>
      <footer className="console-footer">
        Shortcuts: <kbd>Ctrl+Alt+Shift+P</kbd> Play · <kbd>Ctrl+Alt+Shift+C</kbd> Close · <kbd>Ctrl+Alt+Shift+X</kbd> Emergency Seal
        <span>Commands are acknowledged by the portal; playback state is reported by the display.</span>
      </footer>
    </main>
  )
}

export default ControlConsole
