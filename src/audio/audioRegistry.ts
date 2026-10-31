export type AudioCategory = 'ambient' | 'activation'

export type AudioTrack = {
  id: string
  name: string
  category: AudioCategory
  path: string
}

// Tracks are listed explicitly; files are never discovered at runtime.
export const audioTracks: AudioTrack[] = [
  { id: 'abandoned-sector', name: 'Abandoned Sector', category: 'ambient', path: '/audio/ambient/Abandoned Sector.mp3' },
  { id: 'abandoned-sector-alt', name: 'Abandoned Sector (Alt)', category: 'ambient', path: '/audio/ambient/Abandoned Sector (1).mp3' },
  { id: 'subterranean-pulse', name: 'Subterranean Pulse', category: 'ambient', path: '/audio/ambient/Subterranean Pulse.mp3' },
  { id: 'subterranean-pulse-alt', name: 'Subterranean Pulse (Alt)', category: 'ambient', path: '/audio/ambient/Subterranean Pulse (1).mp3' },
  { id: 'portal-activation', name: 'Portal Activation', category: 'activation', path: '/audio/activation/Portal Activation.mp3' },
  { id: 'portal-activation-alt', name: 'Portal Activation (Alt)', category: 'activation', path: '/audio/activation/Portal Activation (1).mp3' },
  { id: 'dimensional-barrier-broken', name: 'Dimensional Barrier Broken', category: 'activation', path: '/audio/activation/dimensional barrier broken.mp3' },
  { id: 'awakening-of-the-machine', name: 'Awakening of the Machine', category: 'activation', path: '/audio/activation/Awakening of the Machine.mp3' },
  { id: 'gateway-resonance', name: 'Gateway Resonance', category: 'activation', path: '/audio/activation/Gateway Resonance.mp3' },
  { id: 'organic-awakening', name: 'Organic Awakening', category: 'activation', path: '/audio/activation/Organic Awakening.mp3' },
  { id: 'reactor-criticality', name: 'Reactor Criticality', category: 'activation', path: '/audio/activation/Reactor Criticality.mp3' },
  { id: 'the-gateway-opens', name: 'The Gateway Opens', category: 'activation', path: '/audio/activation/The Gateway Opens.mp3' },
  { id: 'dimensional-gateway', name: 'Dimensional Gateway', category: 'activation', path: '/audio/activation/Dimensional Gateway.mp3' },
  { id: 'gateway-to-the-ancient', name: 'Gateway to the Ancient', category: 'activation', path: '/audio/activation/Gateway to the Ancient.mp3' },
]

export const ambientTracks = audioTracks.filter((track) => track.category === 'ambient')
export const activationTracks = audioTracks.filter((track) => track.category === 'activation')

export const RANDOM_TRACK_ID = 'random'

export function getAudioTrack(id: string): AudioTrack | undefined {
  return audioTracks.find((track) => track.id === id)
}

export type AudioSettings = {
  ambientTrackId: string
  activationTrackId: string
  masterVolume: number
  ambientVolume: number
  activationVolume: number
  videoVolume: number
  automatic: boolean
  silenced: boolean
}

export const defaultAudioSettings: AudioSettings = {
  ambientTrackId: 'abandoned-sector',
  activationTrackId: RANDOM_TRACK_ID,
  masterVolume: 0.8,
  ambientVolume: 0.5,
  activationVolume: 0.8,
  videoVolume: 1,
  automatic: true,
  silenced: false,
}

const volumeKeys = ['masterVolume', 'ambientVolume', 'activationVolume', 'videoVolume'] as const
const booleanKeys = ['automatic', 'silenced'] as const

// Returns a validated partial settings object, or null if any field is invalid.
export function parseAudioSettingsPatch(value: unknown): Partial<AudioSettings> | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const patch: Partial<AudioSettings> = {}

  for (const [key, entry] of Object.entries(input)) {
    if ((volumeKeys as readonly string[]).includes(key)) {
      if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 1) return null
      patch[key as typeof volumeKeys[number]] = entry
    } else if ((booleanKeys as readonly string[]).includes(key)) {
      if (typeof entry !== 'boolean') return null
      patch[key as typeof booleanKeys[number]] = entry
    } else if (key === 'ambientTrackId' || key === 'activationTrackId') {
      const category: AudioCategory = key === 'ambientTrackId' ? 'ambient' : 'activation'
      const isRandom = key === 'activationTrackId' && entry === RANDOM_TRACK_ID
      if (typeof entry !== 'string' || (!isRandom && getAudioTrack(entry)?.category !== category)) return null
      patch[key] = entry
    } else {
      return null
    }
  }
  return patch
}

export function isAudioSettings(value: unknown): value is AudioSettings {
  const patch = parseAudioSettingsPatch(value)
  return patch !== null && Object.keys(patch).length === Object.keys(defaultAudioSettings).length
}
