import { useCallback, useEffect, useRef, useState } from 'react'
import { activationTracks, ambientTracks, RANDOM_TRACK_ID, type AudioSettings } from './audio/audioRegistry'
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

type VolumeKey = 'masterVolume' | 'ambientVolume' | 'activationVolume' | 'videoVolume'

const volumeControls: { key: VolumeKey; label: string }[] = [
  { key: 'masterVolume', label: 'Master Volume' },
  { key: 'ambientVolume', label: 'Ambient Volume' },
  { key: 'activationVolume', label: 'Activation Volume' },
  { key: 'videoVolume', label: 'Video Volume' },
]

function ControlConsole() {
  const [connected, setConnected] = useState(false)
  const [draftVolumes, setDraftVolumes] = useState<Partial<Record<VolumeKey, number>>>({})
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
    type: Exclude<ControlCommand['type'], 'HELLO' | 'SELECT_SCENARIO' | 'SET_UNSTABLE' | 'SET_AUDIO_SETTINGS' | 'SET_ACTIVATION_TRACK' | 'SET_MEMBRANE_HUE' | 'SET_MEMBRANE_OPACITY'>,
    label: string,
  ) => sendCommand(createControlCommand({ type }), label), [sendCommand])

  // Audio changes are not serialized through the pending-command lock so sliders and
  // Emergency Silence always respond; the portal's reported snapshot is the source of truth.
  const sendAudioSettings = useCallback((settings: Partial<AudioSettings>) => {
    const channel = channelRef.current
    if (!connected || !channel) return
    try {
      channel.postMessage(createControlCommand({ type: 'SET_AUDIO_SETTINGS', settings }))
    } catch (error) {
      setConnectionError(
        error instanceof Error ? `Audio command could not be sent: ${error.message}` : 'Audio command could not be sent.',
      )
    }
  }, [connected])

  const sendEmergencySeal = useCallback(() => {
    sendCommand(createControlCommand({ type: 'EMERGENCY_SEAL' }), 'Emergency seal', true)
  }, [sendCommand])

  const sendMembraneOpacity = useCallback((opacity: number) => {
    const channel = channelRef.current
    if (!connected || !channel) return
    try {
      channel.postMessage(createControlCommand({ type: 'SET_MEMBRANE_OPACITY', opacity }))
    } catch (error) {
      setConnectionError(
        error instanceof Error ? `Opacity command could not be sent: ${error.message}` : 'Opacity command could not be sent.',
      )
    }
  }, [connected])

  const sendMembraneHue = useCallback((hue: number) => {
    const channel = channelRef.current
    if (!connected || !channel) return
    try {
      channel.postMessage(createControlCommand({ type: 'SET_MEMBRANE_HUE', hue }))
    } catch (error) {
      setConnectionError(
        error instanceof Error ? `Color command could not be sent: ${error.message}` : 'Color command could not be sent.',
      )
    }
  }, [connected])

  const sendActivationTrack = useCallback((scenarioId: ScenarioId, trackId: string) => {
    const channel = channelRef.current
    if (!connected || !channel) return
    try {
      channel.postMessage(createControlCommand({ type: 'SET_ACTIVATION_TRACK', scenarioId, trackId }))
    } catch (error) {
      setConnectionError(
        error instanceof Error ? `Audio command could not be sent: ${error.message}` : 'Audio command could not be sent.',
      )
    }
  }, [connected])

  const [activationDraft, setActivationDraft] = useState<Partial<Record<ScenarioId, string>>>({})
  const [hueDraft, setHueDraft] = useState<number | null>(null)
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null)

  // Show the operator's choice immediately; fall back to the reported value if the portal doesn't confirm it.
  const chooseActivationTrack = useCallback((scenarioId: ScenarioId, trackId: string) => {
    setActivationDraft((current) => ({ ...current, [scenarioId]: trackId }))
    window.setTimeout(() => {
      setActivationDraft((current) => {
        const { [scenarioId]: _discarded, ...rest } = current
        return rest
      })
    }, 4000)
    sendActivationTrack(scenarioId, trackId)
  }, [sendActivationTrack])

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
  const audio = snapshot?.audio
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
                <div className="scenario-item" key={scenario.id}>
                  <button
                    className={`scenario-choice${isSelected ? ' scenario-choice--selected' : ''}`}
                    type="button"
                    disabled={actionDisabled}
                    aria-pressed={isSelected}
                    onClick={() => selectScenario(scenario.id)}
                  >
                    <span className="scenario-choice__name">{scenario.name}</span>
                    <span className="scenario-choice__state">{isSelected ? 'SELECTED' : 'SELECT'}</span>
                  </button>
                  <label className="scenario-activation">
                    <span>Activation music</span>
                    <select
                      value={activationDraft[scenario.id] ?? snapshot?.audio.activationByScenario[scenario.id] ?? RANDOM_TRACK_ID}
                      disabled={!snapshot || !connected}
                      onChange={(event) => chooseActivationTrack(scenario.id, event.target.value)}
                    >
                      <option value={RANDOM_TRACK_ID}>No selection (random)</option>
                      {activationTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
                    </select>
                  </label>
                </div>
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
              disabled={actionDisabled || !snapshot || snapshot.portalState === 'CLOSED'}
              onClick={() => sendSimpleCommand('CLOSE_PORTAL', 'Close portal')}
            >
              Close Portal
              <kbd>Ctrl+Alt+Shift+C</kbd>
            </button>
            <button
              className="console-button"
              type="button"
              disabled={actionDisabled || !snapshot}
              onClick={() => sendSimpleCommand('TOGGLE_CALIBRATION', 'Toggle calibration')}
            >
              {snapshot?.calibrationVisible ? 'Hide calibration grid' : 'Show calibration grid'}
            </button>
          </div>
          <div className="hue-control">
            <label className="audio-field">
              <span>Portal Color <output>{hueDraft ?? snapshot?.membraneHue ?? 0}°</output></span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={hueDraft ?? snapshot?.membraneHue ?? 0}
                disabled={!snapshot || !connected}
                onChange={(event) => {
                  const hue = Number(event.target.value)
                  setHueDraft(hue)
                  sendMembraneHue(hue)
                }}
                onPointerUp={() => setHueDraft(null)}
                onKeyUp={() => setHueDraft(null)}
                onBlur={() => setHueDraft(null)}
              />
            </label>
            <button
              className="console-button"
              type="button"
              disabled={!snapshot || !connected || (snapshot.membraneHue === 0 && hueDraft === null)}
              onClick={() => {
                setHueDraft(null)
                sendMembraneHue(0)
              }}
            >
              Reset color
            </button>
            <label className="audio-field">
              <span>Portal Opacity <output>{Math.round((opacityDraft ?? snapshot?.membraneOpacity ?? 1) * 100)}%</output></span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((opacityDraft ?? snapshot?.membraneOpacity ?? 1) * 100)}
                disabled={!snapshot || !connected}
                onChange={(event) => {
                  const opacity = Number(event.target.value) / 100
                  setOpacityDraft(opacity)
                  sendMembraneOpacity(opacity)
                }}
                onPointerUp={() => setOpacityDraft(null)}
                onKeyUp={() => setOpacityDraft(null)}
                onBlur={() => setOpacityDraft(null)}
              />
            </label>
          </div>
          {pendingCommand && (
            <p className="console-feedback" role="status">
              Waiting for portal to acknowledge: {pendingCommand.label}…
            </p>
          )}
        </section>

        <section className="console-card" aria-labelledby="audio-heading">
          <div className="console-card__heading">
            <div>
              <p className="console-eyebrow">Portal speakers</p>
              <h2 id="audio-heading">Audio</h2>
            </div>
            <span
              className={`audio-badge${audio?.error ? ' audio-badge--error' : audio?.ready ? ' audio-badge--ready' : ''}`}
              role="status"
            >
              {!audio ? 'OFFLINE' : audio.error ? 'AUDIO ERROR' : audio.ready ? 'AUDIO READY' : 'NEEDS ENABLE'}
            </span>
          </div>
          {audio && !audio.ready && !audio.error && (
            <p className="console-note">
              Click anywhere in the <code>/portal</code> window once to enable audio; the browser does not
              allow this console to unlock it.
            </p>
          )}
          {audio?.error && <p className="console-alert" role="alert">{audio.error}</p>}
          <div className="audio-controls">
            <label className="audio-field">
              <span>Ambient Track</span>
              <select
                value={audio?.ambientTrackId ?? ''}
                disabled={!audio || !connected}
                onChange={(event) => sendAudioSettings({ ambientTrackId: event.target.value })}
              >
                {!audio && <option value="">—</option>}
                {ambientTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
            <label className="audio-field">
              <span>Activation Track</span>
              <select
                value={audio?.activationTrackId ?? ''}
                disabled={!audio || !connected}
                onChange={(event) => sendAudioSettings({ activationTrackId: event.target.value })}
              >
                {!audio && <option value="">—</option>}
                <option value={RANDOM_TRACK_ID}>No selection (random)</option>
                {activationTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
            {volumeControls.map(({ key, label }) => {
              const value = draftVolumes[key] ?? audio?.[key] ?? 0
              const clearDraft = () => setDraftVolumes((drafts) => {
                const { [key]: _removed, ...rest } = drafts
                void _removed
                return rest
              })
              return (
                <label className="audio-field" key={key}>
                  <span>{label} <output>{Math.round(value * 100)}%</output></span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(value * 100)}
                    disabled={!audio || !connected}
                    onChange={(event) => {
                      const next = Number(event.target.value) / 100
                      setDraftVolumes((drafts) => ({ ...drafts, [key]: next }))
                      sendAudioSettings({ [key]: next })
                    }}
                    onPointerUp={clearDraft}
                    onKeyUp={clearDraft}
                    onBlur={clearDraft}
                  />
                </label>
              )
            })}
            <label className="audio-toggle">
              <input
                type="checkbox"
                checked={audio?.automatic ?? true}
                disabled={!audio || !connected}
                onChange={(event) => sendAudioSettings({ automatic: event.target.checked })}
              />
              <span>Automatic Audio</span>
            </label>
          </div>
          <button
            className={`console-button${audio?.silenced ? '' : ' console-button--danger'}`}
            type="button"
            disabled={!audio || !connected}
            onClick={() => audio && sendAudioSettings({ silenced: !audio.silenced })}
          >
            {audio?.silenced ? 'Restore Audio' : 'Emergency Silence'}
          </button>
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
