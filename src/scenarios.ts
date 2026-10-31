export type ScenarioId =
  | 'the-observer'
  | 'the-mimic'
  | 'the-creature'
  | 'the-goliath'
  | 'the-ai'
  | 'the-otherside'
  | 'the-woods'
  | 'storybook'

export type Scenario = {
  id: ScenarioId
  name: string
  description: string
  videoPath: string
  loop: boolean
  onEnd: 'close'
  videoEnding: 'abrupt' | 'fade-out'
  visualSettings: {
    scale: number
    x: number
    y: number
  }
}

export const scenarioRegistry: Record<ScenarioId, Scenario> = {
  'the-observer': {
    id: 'the-observer',
    name: 'The Observer',
    description: 'A towering figure investigates the barrier before vanishing.',
    videoPath: '/videos/the_observer.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  'the-mimic': {
    id: 'the-mimic',
    name: 'The Mimic',
    description: 'A second encounter emerges through the portal.',
    videoPath: '/videos/the_mimic.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'abrupt',
    visualSettings: { scale: 0.9, x: 0, y: 0 },
  },
  'the-creature': {
    id: 'the-creature',
    name: 'The Creature',
    description: 'Something stirs on the other side of the membrane.',
    videoPath: '/videos/the_creature.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  'the-goliath': {
    id: 'the-goliath',
    name: 'The Goliath',
    description: 'An enormous presence presses against the barrier.',
    videoPath: '/videos/the_goliath.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  'the-ai': {
    id: 'the-ai',
    name: 'The AI',
    description: 'A synthetic intelligence reaches through the portal.',
    videoPath: '/videos/the_ai.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  'the-otherside': {
    id: 'the-otherside',
    name: 'The Otherside',
    description: 'A glimpse of the world beyond the portal.',
    videoPath: '/videos/the_otherside.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  'the-woods': {
    id: 'the-woods',
    name: 'The Woods',
    description: 'Something moves among the trees beyond the barrier.',
    videoPath: '/videos/the_woods.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
  storybook: {
    id: 'storybook',
    name: 'Storybook',
    description: 'A tale unfolds from the other side.',
    videoPath: '/videos/storybook.mp4',
    loop: false,
    onEnd: 'close',
    videoEnding: 'fade-out',
    visualSettings: { scale: 1, x: 0, y: 0 },
  },
}
