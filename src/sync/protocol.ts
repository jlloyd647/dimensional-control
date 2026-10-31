import { scenarioRegistry, type ScenarioId } from '../scenarios'
import { isAudioSettings, parseAudioSettingsPatch, type AudioSettings } from '../audio/audioRegistry'

export const CHANNEL_NAME = 'dimensional-control'

export type PortalState = 'CLOSED' | 'OPENING' | 'ACTIVE' | 'SEALING'
export type VideoStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

export type AudioSnapshot = AudioSettings & {
  ready: boolean
  error: string | null
  activationByScenario: Partial<Record<ScenarioId, string>>
}

export type PortalSnapshot = {
  portalState: PortalState
  selectedScenarioId: ScenarioId
  videoStatus: VideoStatus
  calibrationVisible: boolean
  unstable: boolean
  error: string | null
  audio: AudioSnapshot
}

type MessageBase = {
  messageId: string
  sentAt: number
}

type ControlCommandPayload =
  | { type: 'HELLO' }
  | { type: 'SELECT_SCENARIO'; scenarioId: ScenarioId }
  | { type: 'START_SCENARIO' }
  | { type: 'CLOSE_PORTAL' }
  | { type: 'EMERGENCY_SEAL' }
  | { type: 'TOGGLE_CALIBRATION' }
  | { type: 'SET_UNSTABLE'; enabled: boolean }
  | { type: 'SET_AUDIO_SETTINGS'; settings: Partial<AudioSettings> }
  | { type: 'SET_ACTIVATION_TRACK'; scenarioId: ScenarioId; trackId: string }
export type ControlCommand = MessageBase & ControlCommandPayload

type PortalEventPayload =
  | { type: 'STATE_SNAPSHOT'; snapshot: PortalSnapshot }
  | { type: 'HEARTBEAT'; snapshot: PortalSnapshot }
  | { type: 'ACK'; commandId: string }
  | { type: 'ERROR'; commandId?: string; message: string }
export type PortalEvent = MessageBase & PortalEventPayload

export type SyncMessage = ControlCommand | PortalEvent

const portalStates: PortalState[] = ['CLOSED', 'OPENING', 'ACTIVE', 'SEALING']
const videoStatuses: VideoStatus[] = ['idle', 'loading', 'ready', 'playing', 'paused', 'ended', 'error']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasMessageBase(value: Record<string, unknown>): boolean {
  return typeof value.messageId === 'string' && typeof value.sentAt === 'number'
}

function isPortalSnapshot(value: unknown): value is PortalSnapshot {
  return isRecord(value)
    && portalStates.includes(value.portalState as PortalState)
    && typeof value.selectedScenarioId === 'string'
    && Object.prototype.hasOwnProperty.call(scenarioRegistry, value.selectedScenarioId)
    && videoStatuses.includes(value.videoStatus as VideoStatus)
    && typeof value.calibrationVisible === 'boolean'
    && typeof value.unstable === 'boolean'
    && (typeof value.error === 'string' || value.error === null)
    && isAudioSnapshot(value.audio)
}

function isAudioSnapshot(value: unknown): value is AudioSnapshot {
  if (!isRecord(value) || typeof value.ready !== 'boolean') return false
  if (!(typeof value.error === 'string' || value.error === null)) return false
  const { ready, error, activationByScenario, ...settings } = value
  void ready
  void error
  return isRecord(activationByScenario) && isAudioSettings(settings)
}

export function isControlCommand(value: unknown): value is ControlCommand {
  if (!isRecord(value) || !hasMessageBase(value)) return false

  switch (value.type) {
    case 'HELLO':
    case 'START_SCENARIO':
    case 'CLOSE_PORTAL':
    case 'EMERGENCY_SEAL':
    case 'TOGGLE_CALIBRATION':
      return true
    case 'SET_UNSTABLE':
      return typeof value.enabled === 'boolean'
    case 'SET_AUDIO_SETTINGS':
      return parseAudioSettingsPatch(value.settings) !== null
    case 'SET_ACTIVATION_TRACK':
      return typeof value.scenarioId === 'string'
        && Object.prototype.hasOwnProperty.call(scenarioRegistry, value.scenarioId)
        && parseAudioSettingsPatch({ activationTrackId: value.trackId }) !== null
    case 'SELECT_SCENARIO':
      return typeof value.scenarioId === 'string'
        && Object.prototype.hasOwnProperty.call(scenarioRegistry, value.scenarioId)
    default:
      return false
  }
}

export function isPortalEvent(value: unknown): value is PortalEvent {
  if (!isRecord(value) || !hasMessageBase(value)) return false

  switch (value.type) {
    case 'STATE_SNAPSHOT':
    case 'HEARTBEAT':
      return isPortalSnapshot(value.snapshot)
    case 'ACK':
      return typeof value.commandId === 'string'
    case 'ERROR':
      return typeof value.message === 'string'
        && (value.commandId === undefined || typeof value.commandId === 'string')
    default:
      return false
  }
}

export function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createControlCommand<T extends ControlCommandPayload>(payload: T): T & MessageBase {
  return {
    ...payload,
    messageId: createMessageId(),
    sentAt: Date.now(),
  }
}

export function createPortalEvent<T extends PortalEventPayload>(payload: T): T & MessageBase {
  return {
    ...payload,
    messageId: createMessageId(),
    sentAt: Date.now(),
  }
}
