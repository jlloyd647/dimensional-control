import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type AudioStatus } from './audio/AudioEngine'
import {
  ambientTracks,
  defaultAudioSettings,
  parseAudioSettingsPatch,
  RANDOM_TRACK_ID,
  type AudioSettings,
} from './audio/audioRegistry'
import { OPENING_DURATION_MS, SEALING_DURATION_MS } from './portalTiming'
import { MembraneCanvas } from './MembraneCanvas'
import { scenarioRegistry, type ScenarioId } from './scenarios'
import {
  CHANNEL_NAME,
  createPortalEvent,
  isControlCommand,
  type ControlCommand,
  type PortalSnapshot,
  type VideoStatus,
} from './sync/protocol'
import './App.css'

type PortalState = PortalSnapshot['portalState']

const AUDIO_STORAGE_KEY = 'dimensional-control.audio'
const ACTIVATION_STORAGE_KEY = 'dimensional-control.activation-by-scenario'
const HUE_STORAGE_KEY = 'dimensional-control.membrane-hue'
const OPACITY_STORAGE_KEY = 'dimensional-control.membrane-opacity'
const MEMBRANE_OPACITY_ACTIVE = 0.25
const MEMBRANE_OPACITY_AFTER = 0.75

function loadMembraneOpacity(): number {
  try {
    const stored = window.localStorage.getItem(OPACITY_STORAGE_KEY)
    const opacity = stored === null ? 1 : Number(stored)
    return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1
  } catch {
    return 1
  }
}

function loadMembraneHue(): number {
  try {
    const hue = Number(window.localStorage.getItem(HUE_STORAGE_KEY))
    return Number.isFinite(hue) ? Math.min(180, Math.max(-180, hue)) : 0
  } catch {
    return 0
  }
}
type ActivationByScenario = Partial<Record<ScenarioId, string>>

// Per-scenario activation choices persist in localStorage across sessions.
function loadActivationByScenario(): ActivationByScenario {
  const result: ActivationByScenario = {}
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(ACTIVATION_STORAGE_KEY) ?? '{}')
    if (typeof stored !== 'object' || stored === null) return result
    for (const [scenarioId, trackId] of Object.entries(stored)) {
      if (!Object.prototype.hasOwnProperty.call(scenarioRegistry, scenarioId)) continue
      if (parseAudioSettingsPatch({ activationTrackId: trackId })) result[scenarioId as ScenarioId] = trackId as string
    }
  } catch {
    // Unreadable storage falls back to random for every scenario.
  }
  return result
}

function loadAudioSettings(): AudioSettings {
  try {
    const stored = window.sessionStorage.getItem(AUDIO_STORAGE_KEY)
    const patch = stored ? parseAudioSettingsPatch(JSON.parse(stored)) : null
    return { ...defaultAudioSettings, ...patch, silenced: false }
  } catch {
    return defaultAudioSettings
  }
}

function Portal() {
  const [portalState, setPortalState] = useState<PortalState>('CLOSED')
  const [openingRun, setOpeningRun] = useState(0)
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings)
  const [activationByScenario, setActivationByScenario] = useState<ActivationByScenario>(loadActivationByScenario)
  const [audioStatus, setAudioStatus] = useState<AudioStatus>({ ready: false, error: null })
  const audioEngineRef = useRef<AudioEngine | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId>('the-observer')
  const effectiveAudio = useMemo<AudioSettings>(() => ({
    ...audioSettings,
    activationTrackId: activationByScenario[selectedScenarioId] ?? RANDOM_TRACK_ID,
  }), [audioSettings, activationByScenario, selectedScenarioId])
  const audioSettingsRef = useRef(effectiveAudio)
  const [calibrationVisible, setCalibrationVisible] = useState(false)
  const [playbackUnlocked, setPlaybackUnlocked] = useState(
    () => navigator.userActivation?.hasBeenActive ?? false,
  )
  const [unstable, setUnstable] = useState(false)
  const [membraneHue, setMembraneHue] = useState(loadMembraneHue)
  const [membraneOpacity, setMembraneOpacity] = useState(loadMembraneOpacity)
  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [mirrored, setMirrored] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('loading')
  const videoRef = useRef<HTMLVideoElement>(null)
  const transitionTimer = useRef<number | null>(null)
  const transitionId = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const handledCommandIds = useRef(new Set<string>())
  const selectedScenario = scenarioRegistry[selectedScenarioId]
  const snapshot = useMemo<PortalSnapshot>(() => ({
    portalState,
    selectedScenarioId,
    videoStatus,
    calibrationVisible,
    unstable,
    membraneHue,
    membraneOpacity,
    error: scenarioError,
    audio: { ...effectiveAudio, ...audioStatus, activationByScenario },
  }), [portalState, selectedScenarioId, videoStatus, calibrationVisible, unstable, membraneHue, membraneOpacity, scenarioError, effectiveAudio, audioStatus, activationByScenario])
  const snapshotRef = useRef<PortalSnapshot>({
    portalState: 'CLOSED',
    selectedScenarioId: 'the-observer',
    videoStatus: 'loading',
    calibrationVisible: false,
    unstable: false,
    membraneHue: 0,
    membraneOpacity: 1,
    error: null,
    audio: { ...defaultAudioSettings, ready: false, error: null, activationByScenario: {} },
  })

  const publishSnapshot = useCallback(() => {
    channelRef.current?.postMessage(createPortalEvent({ type: 'STATE_SNAPSHOT', snapshot: snapshotRef.current }))
  }, [])

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current)
      transitionTimer.current = null
    }
  }, [])

  const emergencyClose = useCallback(() => {
    clearTransitionTimer()
    transitionId.current += 1
    const video = videoRef.current
    video?.pause()
    if (video && video.readyState > HTMLMediaElement.HAVE_NOTHING) video.currentTime = 0
    audioEngineRef.current?.setPhase('idle', { ambientMs: 1000, activationMs: 100 })
    setPortalState('CLOSED')
    setVideoStatus('idle')
    setUnstable(false)
  }, [clearTransitionTimer])

  const closePortal = useCallback(() => {
    clearTransitionTimer()
    const id = ++transitionId.current
    videoRef.current?.pause()
    setVideoStatus('paused')
    setPortalState('SEALING')
    setUnstable(false)
    transitionTimer.current = window.setTimeout(() => {
      if (transitionId.current === id) {
        setPortalState('CLOSED')
        transitionTimer.current = null
      }
    }, SEALING_DURATION_MS)
  }, [clearTransitionTimer])

  const failPlayback = useCallback((reason?: unknown) => {
    clearTransitionTimer()
    transitionId.current += 1
    videoRef.current?.pause()
    const detail = reason instanceof Error ? ` ${reason.message}` : ''
    const blockedByAutoplay = reason instanceof DOMException && reason.name === 'NotAllowedError'
    const message = blockedByAutoplay
      ? `${selectedScenario.name} was blocked by the browser. Click once anywhere in the /portal window to enable playback, then try again.`
      : `${selectedScenario.name} could not be loaded or played. Confirm that ${selectedScenario.videoPath} is available as a browser-compatible MP4.${detail}`
    setPortalState('CLOSED')
    setVideoStatus('error')
    setScenarioError(message)
    channelRef.current?.postMessage(createPortalEvent({ type: 'ERROR', message }))
  }, [clearTransitionTimer, selectedScenario])

  const startScenario = useCallback(() => {
    clearTransitionTimer()
    transitionId.current += 1
    setScenarioError(null)
    setCalibrationVisible(false)
    const video = videoRef.current
    if (video?.error) {
      failPlayback()
      return
    }
    video?.pause()
    if (video && video.readyState > HTMLMediaElement.HAVE_NOTHING) video.currentTime = 0
    setVideoStatus(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'ready' : 'loading')
    setPortalState('OPENING')
    setOpeningRun((run) => run + 1)
  }, [clearTransitionTimer, failPlayback])

  const handleCommand = useCallback((command: ControlCommand) => {
    if (command.type === 'HELLO') {
      publishSnapshot()
      return
    }

    if (handledCommandIds.current.has(command.messageId)) {
      channelRef.current?.postMessage(createPortalEvent({ type: 'ACK', commandId: command.messageId }))
      return
    }
    handledCommandIds.current.add(command.messageId)
    if (handledCommandIds.current.size > 100) {
      const oldestId = handledCommandIds.current.values().next().value
      if (oldestId) handledCommandIds.current.delete(oldestId)
    }

    switch (command.type) {
      case 'SELECT_SCENARIO':
        emergencyClose()
        setScenarioError(null)
        setVideoStatus('loading')
        setSelectedScenarioId(command.scenarioId)
        break
      case 'START_SCENARIO':
        startScenario()
        break
      case 'CLOSE_PORTAL':
        closePortal()
        break
      case 'EMERGENCY_SEAL':
        emergencyClose()
        break
      case 'TOGGLE_CALIBRATION':
        setCalibrationVisible((visible) => !visible)
        break
      case 'SET_UNSTABLE':
        setUnstable(command.enabled)
        break
      case 'SET_MEMBRANE_OPACITY':
        setMembraneOpacity(command.opacity)
        break
      case 'SET_MEMBRANE_HUE':
        setMembraneHue(command.hue)
        break
      case 'SET_ACTIVATION_TRACK':
        setActivationByScenario((current) => ({ ...current, [command.scenarioId]: command.trackId }))
        break
      case 'SET_AUDIO_SETTINGS': {
        const { activationTrackId, ...rest } = command.settings
        if (activationTrackId) {
          setActivationByScenario((current) => ({ ...current, [selectedScenarioId]: activationTrackId }))
        }
        if (Object.keys(rest).length > 0) setAudioSettings((settings) => ({ ...settings, ...rest }))
        break
      }
    }

    channelRef.current?.postMessage(createPortalEvent({ type: 'ACK', commandId: command.messageId }))
  }, [closePortal, emergencyClose, publishSnapshot, startScenario, selectedScenarioId])

  const commandHandler = useRef(handleCommand)
  useEffect(() => {
    commandHandler.current = handleCommand
  }, [handleCommand])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    const engine = new AudioEngine(audioSettingsRef.current, setAudioStatus)
    audioEngineRef.current = engine
    void engine.unlock()
    window.setTimeout(() => setAudioStatus(engine.status), 0)
    return () => {
      engine.dispose()
      audioEngineRef.current = null
    }
  }, [])

  useEffect(() => {
    audioSettingsRef.current = effectiveAudio
    audioEngineRef.current?.setSettings(effectiveAudio)
  }, [effectiveAudio])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(audioSettings))
    } catch {
      // Session storage is optional; settings simply will not persist across reloads.
    }
  }, [audioSettings])

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(activationByScenario))
    } catch {
      // Local storage is optional; activation choices simply will not persist.
    }
  }, [activationByScenario])

  useEffect(() => {
    try {
      window.localStorage.setItem(HUE_STORAGE_KEY, String(membraneHue))
    } catch {
      // Local storage is optional; the color simply will not persist.
    }
  }, [membraneHue])

  useEffect(() => {
    try {
      window.localStorage.setItem(OPACITY_STORAGE_KEY, String(membraneOpacity))
    } catch {
      // Local storage is optional; the opacity simply will not persist.
    }
  }, [membraneOpacity])
  // Keep multiple open portal windows consistent with each other.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVATION_STORAGE_KEY) setActivationByScenario(loadActivationByScenario())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    audioEngineRef.current?.attachVideo(videoRef.current)
  }, [selectedScenarioId])

  // The audio engine only reacts to state-machine transitions; it never starts videos.
  useEffect(() => {
    const engine = audioEngineRef.current
    if (!engine) return
    if (portalState === 'OPENING') engine.setPhase('opening')
    else if (portalState === 'ACTIVE') engine.setPhase('video')
    else engine.setPhase('idle')
  }, [portalState, openingRun])

  // The membrane dims while a video plays and returns to a higher resting level afterwards.
  const previousPortalState = useRef(portalState)
  useEffect(() => {
    const wasActive = previousPortalState.current === 'ACTIVE'
    previousPortalState.current = portalState
    const isActive = portalState === 'ACTIVE'
    if (!isActive && !wasActive) return
    window.setTimeout(() => {
      setMembraneOpacity(isActive ? MEMBRANE_OPACITY_ACTIVE : MEMBRANE_OPACITY_AFTER)
      if (isActive) return
      // When a video finishes or is closed, return to a different random ambient track.
      setAudioSettings((settings) => {
        const others = ambientTracks.filter((track) => track.id !== settings.ambientTrackId)
        if (others.length === 0) return settings
        return { ...settings, ambientTrackId: others[Math.floor(Math.random() * others.length)].id }
      })
    }, 0)
  }, [portalState])

  useEffect(() => {
    let channel: BroadcastChannel
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = channel
    } catch (error) {
      const message = error instanceof Error
        ? `Portal synchronization is unavailable: ${error.message}`
        : 'Portal synchronization is unavailable.'
      window.setTimeout(() => setScenarioError(message), 0)
      return
    }

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isControlCommand(event.data)) commandHandler.current(event.data)
    }
    channel.postMessage(createPortalEvent({ type: 'STATE_SNAPSHOT', snapshot: snapshotRef.current }))
    const heartbeat = window.setInterval(() => {
      channel.postMessage(createPortalEvent({ type: 'HEARTBEAT', snapshot: snapshotRef.current }))
    }, 1000)

    return () => {
      window.clearInterval(heartbeat)
      channel.close()
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    publishSnapshot()
  }, [snapshot, publishSnapshot])

  const toggleFullscreen = useCallback(() => {
    setFullscreenError('')
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        setFullscreenError('Could not exit fullscreen. Use Escape to leave fullscreen.')
      })
      return
    }

    void document.documentElement.requestFullscreen().catch(() => {
      setFullscreenError('Fullscreen was denied. Allow fullscreen in the browser and try again.')
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.altKey && event.shiftKey) || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))) {
        return
      }

      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault()
          setCalibrationVisible((visible) => !visible)
          break
        case 'f':
          event.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFullscreen])

  useEffect(() => {
    if (portalState !== 'OPENING') return

    const video = videoRef.current
    if (!video) {
      failPlayback()
      return
    }

    let cancelled = false
    let openingElapsed = false
    let mediaReady = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    const id = transitionId.current

    const activateIfReady = () => {
      if (!cancelled && openingElapsed && mediaReady && transitionId.current === id) {
        setPortalState('ACTIVE')
      }
    }
    const onCanPlay = () => {
      mediaReady = true
      setVideoStatus('ready')
      activateIfReady()
    }
    const timer = window.setTimeout(() => {
      openingElapsed = true
      transitionTimer.current = null
      activateIfReady()
    }, OPENING_DURATION_MS)
    transitionTimer.current = timer

    if (!mediaReady) {
      video.addEventListener('loadeddata', onCanPlay)
      video.addEventListener('canplay', onCanPlay)
    }
    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', onCanPlay)
      video.removeEventListener('canplay', onCanPlay)
      window.clearTimeout(timer)
      if (transitionTimer.current === timer) transitionTimer.current = null
    }
  }, [portalState, openingRun, failPlayback])

  useEffect(() => {
    if (portalState !== 'ACTIVE') return

    const video = videoRef.current
    if (!video) {
      failPlayback()
      return
    }

    let cancelled = false
    void video.play().catch((error: unknown) => {
      if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
      failPlayback(error)
    })

    return () => {
      cancelled = true
      video.pause()
    }
  }, [portalState, failPlayback])

  useEffect(() => () => {
    clearTransitionTimer()
    transitionId.current += 1
  }, [clearTransitionTimer])

  useEffect(() => {
    if (playbackUnlocked) return
    const unlock = () => {
      setPlaybackUnlocked(true)
      void audioEngineRef.current?.unlock()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [playbackUnlocked])

  return (
    <main className="portal" aria-label="Dimensional portal display">
      <div className="portal-stage">
        <div
          className={unstable ? 'portal-visual portal-visual--unstable' : 'portal-visual'}
          style={{
            transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale}) scaleX(${mirrored ? -1 : 1})`,
          }}
        >
          <div
            className={[
              'membrane',
              `membrane--${portalState.toLowerCase()}`,
              calibrationVisible ? 'membrane--calibrating' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
            style={membraneHue !== 0 ? { filter: `hue-rotate(${membraneHue}deg)` } : undefined}
          >
            <MembraneCanvas opacity={membraneOpacity} />
          </div>
          <div
            className={[
              'scenario-video-frame',
              portalState === 'ACTIVE' ? 'scenario-video-frame--active' : '',
              portalState === 'SEALING' ? `scenario-video-frame--sealing-${selectedScenario.videoEnding}` : '',
            ].filter(Boolean).join(' ')}
            style={{
              width: `${selectedScenario.visualSettings.scale * 100}%`,
              left: `calc(50% + ${selectedScenario.visualSettings.x}%)`,
              top: `calc(50% + ${selectedScenario.visualSettings.y}%)`,
            }}
          >
            <video
              key={selectedScenario.id}
              ref={videoRef}
              className="scenario-video"
              src={selectedScenario.videoPath}
              loop={selectedScenario.loop}
              playsInline
              preload="auto"
              onLoadStart={() => setVideoStatus('loading')}
              onCanPlay={() => setVideoStatus('ready')}
              onPlay={() => setVideoStatus('playing')}
              onPause={() => {
                if (portalState === 'ACTIVE') setVideoStatus('paused')
              }}
              onEnded={() => {
                setVideoStatus('ended')
                if (!selectedScenario.loop && selectedScenario.onEnd === 'close') closePortal()
              }}
              onError={() => failPlayback()}
            />
          </div>
          {unstable && <div className="portal-instability" aria-hidden="true" />}
          {calibrationVisible && (
            <div className="calibration-grid" aria-hidden="true">
              <span className="calibration-grid__crosshair" />
              <span className="calibration-grid__label calibration-grid__label--top">TOP</span>
              <span className="calibration-grid__label calibration-grid__label--bottom">BOTTOM</span>
              <span className="calibration-grid__label calibration-grid__label--left">LEFT</span>
              <span className="calibration-grid__label calibration-grid__label--right">RIGHT</span>
            </div>
          )}
        </div>
      </div>

      {!playbackUnlocked && !audioStatus.ready && (
        <div className="portal-unlock" role="status">Click this window once to enable audio and video</div>
      )}

      {calibrationVisible && (
        <section className="calibration-panel" aria-label="Projection calibration">
          <div className="calibration-panel__heading">
            <p className="eyebrow">Projection setup</p>
            <h1>Calibrate portal</h1>
          </div>

          <label className="calibration-control">
            <span>Scale <output>{scale.toFixed(2)}×</output></span>
            <input type="range" min="0.7" max="1.3" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
          </label>

          <label className="calibration-control">
            <span>Horizontal offset <output>{offsetX}%</output></span>
            <input type="range" min="-15" max="15" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
          </label>

          <label className="calibration-control">
            <span>Vertical offset <output>{offsetY}%</output></span>
            <input type="range" min="-15" max="15" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
          </label>

          <label className="calibration-toggle">
            <input type="checkbox" checked={mirrored} onChange={(event) => setMirrored(event.target.checked)} />
            <span>Mirror horizontally</span>
          </label>

          {fullscreenError && <p className="calibration-error" role="alert">{fullscreenError}</p>}
          {scenarioError && <p className="calibration-error" role="alert">{scenarioError}</p>}
          <p className="calibration-hint">
            Adjust the grid to the membrane, then use Ctrl+Alt+Shift+C or the console to hide calibration before the show.
          </p>
        </section>
      )}
    </main>
  )
}

export default Portal
