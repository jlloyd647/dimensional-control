import {
  getAudioTrack,
  type AudioSettings,
  type AudioTrack,
} from './audioRegistry'

export type AudioPhase = 'idle' | 'opening' | 'video'
export type AudioStatus = { ready: boolean; error: string | null }

const CROSSFADE_MS = 2000
const SWITCH_FADE_MS = 1000
const DEFAULT_AMBIENT_FADE_MS = 2500
const DEFAULT_ACTIVATION_FADE_MS = 500
const ACTIVATION_IN_MS = 400
const AMBIENT_DUCK_MS = 1500
const VIDEO_AMBIENT_MS = 800
const ACTIVATION_OUT_MS = 1000
const SILENCE_RESTORE_MS = 300

function fadeParam(context: AudioContext, param: AudioParam, target: number, ms: number) {
  const now = context.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  if (ms <= 0) param.setValueAtTime(target, now)
  else param.linearRampToValueAtTime(target, now + ms / 1000)
}

class Voice {
  readonly track: AudioTrack
  private readonly el: HTMLAudioElement
  private readonly gain: GainNode
  private readonly context: AudioContext
  private readonly onError: (trackId: string, message: string) => void
  private target = 0
  private stopTimer: number | null = null

  constructor(
    context: AudioContext,
    bus: AudioNode,
    track: AudioTrack,
    onError: (trackId: string, message: string) => void,
  ) {
    this.track = track
    this.context = context
    this.onError = onError
    this.el = new Audio(encodeURI(track.path))
    this.el.preload = 'auto'
    this.el.loop = track.category === 'ambient'
    this.el.addEventListener('error', () => {
      onError(track.id, `"${track.name}" could not be loaded. Check that ${track.path} exists.`)
    })
    this.gain = context.createGain()
    this.gain.gain.value = 0
    context.createMediaElementSource(this.el).connect(this.gain)
    this.gain.connect(bus)
  }

  setTarget(target: number, ms: number, restart = false) {
    if (target === this.target && !restart) return
    this.target = target

    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer)
      this.stopTimer = null
    }

    if (target > 0) {
      if (restart) {
        this.gain.gain.cancelScheduledValues(0)
        this.gain.gain.value = 0
        this.el.currentTime = 0
      }
      if (this.el.paused || restart) this.play()
      fadeParam(this.context, this.gain.gain, target, ms)
      return
    }

    fadeParam(this.context, this.gain.gain, 0, ms)
    this.stopTimer = window.setTimeout(() => {
      this.stopTimer = null
      if (this.target === 0) this.el.pause()
    }, ms + 60)
  }

  // Retries playback that the browser blocked before audio was unlocked.
  resumeIfWanted() {
    if (this.target > 0 && this.el.paused && !this.el.ended) this.play()
  }

  private play() {
    this.el.play().catch((error: unknown) => {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) return
      this.onError(this.track.id, `"${this.track.name}" could not be played.`)
    })
  }

  dispose() {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer)
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.gain.disconnect()
  }
}

export class AudioEngine {
  private context: AudioContext | null = null
  private contextError: string | null = null
  private masterGain: GainNode | null = null
  private silenceGain: GainNode | null = null
  private ambientBus: GainNode | null = null
  private activationBus: GainNode | null = null
  private videoBus: GainNode | null = null
  private readonly voices = new Map<string, Voice>()
  private readonly trackErrors = new Map<string, string>()
  private readonly videoSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  private video: HTMLVideoElement | null = null
  private phase: AudioPhase = 'idle'
  private activationId: string | null = null
  private disposed = false
  private lastStatus: AudioStatus | null = null
  private settings: AudioSettings
  private readonly onStatus: (status: AudioStatus) => void

  constructor(settings: AudioSettings, onStatus: (status: AudioStatus) => void) {
    this.settings = settings
    this.onStatus = onStatus
    try {
      const context = new AudioContext()
      this.context = context
      this.masterGain = context.createGain()
      this.silenceGain = context.createGain()
      this.ambientBus = context.createGain()
      this.activationBus = context.createGain()
      this.videoBus = context.createGain()
      for (const bus of [this.ambientBus, this.activationBus, this.videoBus]) bus.connect(this.silenceGain)
      this.silenceGain.connect(this.masterGain)
      this.masterGain.connect(context.destination)
      this.applyGains(true)
      context.addEventListener('statechange', () => this.onContextRunning())
    } catch (error) {
      this.context = null
      this.contextError = error instanceof Error
        ? `Audio engine unavailable: ${error.message}`
        : 'Audio engine unavailable.'
    }
  }

  get status(): AudioStatus {
    const error = this.contextError
      ?? this.trackErrors.get(this.settings.ambientTrackId)
      ?? this.trackErrors.get(this.settings.activationTrackId)
      ?? null
    return { ready: this.context?.state === 'running', error }
  }

  private emitStatus() {
    if (this.disposed) return
    const status = this.status
    if (this.lastStatus?.ready === status.ready && this.lastStatus.error === status.error) return
    this.lastStatus = status
    this.onStatus(status)
  }

  private reportTrackError = (trackId: string, message: string) => {
    this.trackErrors.set(trackId, message)
    this.emitStatus()
  }

  // Must be called from a user gesture the first time.
  async unlock() {
    if (!this.context || this.disposed) return
    try {
      await this.context.resume()
    } catch (error) {
      this.contextError = error instanceof Error ? `Audio could not start: ${error.message}` : 'Audio could not start.'
    }
    if (this.disposed) return
    this.onContextRunning()
  }

  private onContextRunning() {
    if (this.disposed) return
    this.applyVideo()
    this.reconcile(0, 0)
    this.voices.forEach((voice) => voice.resumeIfWanted())
    this.emitStatus()
  }

  setSettings(next: AudioSettings) {
    const previous = this.settings
    this.settings = next
    if (!this.context) return

    this.applyGains(next.silenced === previous.silenced)
    this.applyVideo()
    this.prefetch()

    if (next.ambientTrackId !== previous.ambientTrackId) {
      this.trackErrors.delete(previous.ambientTrackId)
      this.reconcile(CROSSFADE_MS, DEFAULT_ACTIVATION_FADE_MS)
    } else if (next.automatic !== previous.automatic) {
      this.reconcile(SWITCH_FADE_MS, SWITCH_FADE_MS)
    }
    this.emitStatus()
  }

  setPhase(phase: AudioPhase, options: { ambientMs?: number; activationMs?: number } = {}) {
    this.phase = phase
    if (!this.context) return

    switch (phase) {
      case 'opening':
        this.activationId = this.settings.activationTrackId
        this.trackErrors.delete(this.activationId)
        this.reconcile(AMBIENT_DUCK_MS, ACTIVATION_IN_MS, true)
        break
      case 'video':
        this.reconcile(VIDEO_AMBIENT_MS, ACTIVATION_OUT_MS)
        break
      case 'idle':
        this.reconcile(
          options.ambientMs ?? DEFAULT_AMBIENT_FADE_MS,
          options.activationMs ?? DEFAULT_ACTIVATION_FADE_MS,
        )
        break
    }
    this.emitStatus()
  }

  attachVideo(video: HTMLVideoElement | null) {
    this.video = video
    this.applyVideo()
  }

  dispose() {
    this.disposed = true
    this.voices.forEach((voice) => voice.dispose())
    this.voices.clear()
    void this.context?.close().catch(() => undefined)
  }

  private getVoice(id: string): Voice | null {
    const existing = this.voices.get(id)
    if (existing) return existing
    const track = getAudioTrack(id)
    if (!track || !this.context) return null

    const bus = track.category === 'ambient' ? this.ambientBus : this.activationBus
    if (!bus) return null
    try {
      const voice = new Voice(this.context, bus, track, this.reportTrackError)
      this.voices.set(id, voice)
      return voice
    } catch (error) {
      this.reportTrackError(id, `"${track.name}" could not be prepared${error instanceof Error ? `: ${error.message}` : '.'}`)
      return null
    }
  }

  private prefetch() {
    this.getVoice(this.settings.ambientTrackId)
    this.getVoice(this.settings.activationTrackId)
  }

  private reconcile(ambientMs: number, activationMs: number, restartActivation = false) {
    if (!this.context) return
    const effective = this.settings.automatic ? this.phase : null
    const wantAmbient = effective === 'idle'
    const wantActivation = effective === 'opening'

    const ambientId = this.settings.ambientTrackId
    if (wantAmbient) this.getVoice(ambientId)
    const activationId = this.activationId
    if (wantActivation && activationId) this.getVoice(activationId)

    this.voices.forEach((voice, id) => {
      if (voice.track.category === 'ambient') {
        voice.setTarget(wantAmbient && id === ambientId ? 1 : 0, ambientMs)
      } else {
        const active = wantActivation && id === activationId
        voice.setTarget(active ? 1 : 0, activationMs, active && restartActivation)
      }
    })
  }

  private applyGains(immediate: boolean) {
    const context = this.context
    if (!context || !this.masterGain || !this.silenceGain || !this.ambientBus || !this.activationBus || !this.videoBus) return
    const { settings } = this
    const now = context.currentTime
    this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.03)
    this.ambientBus.gain.setTargetAtTime(settings.ambientVolume, now, 0.03)
    this.activationBus.gain.setTargetAtTime(settings.activationVolume, now, 0.03)
    this.videoBus.gain.setTargetAtTime(settings.videoVolume, now, 0.03)

    if (settings.silenced) fadeParam(context, this.silenceGain.gain, 0, 0)
    else fadeParam(context, this.silenceGain.gain, 1, immediate ? 0 : SILENCE_RESTORE_MS)
  }

  private applyVideo() {
    const video = this.video
    if (!video) return
    const { settings } = this
    video.muted = settings.silenced

    if (this.context?.state === 'running' && this.videoBus) {
      if (!this.videoSources.has(video)) {
        try {
          const source = this.context.createMediaElementSource(video)
          source.connect(this.videoBus)
          this.videoSources.set(video, source)
        } catch {
          video.volume = settings.masterVolume * settings.videoVolume
          return
        }
      }
      video.volume = 1
      return
    }

    // Until audio is unlocked the video keeps native playback and its own volume.
    video.volume = settings.masterVolume * settings.videoVolume
  }
}
