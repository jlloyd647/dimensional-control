import { useEffect, useRef } from 'react'

const RESOLUTION = 160
const FRAME_INTERVAL_MS = 1000 / 24
const TIME_SCALE = 0.00006

const LATTICE_SIZE = 256
const lattice = (() => {
  const values = new Float32Array(LATTICE_SIZE)
  let seed = 1337
  for (let i = 0; i < LATTICE_SIZE; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    values[i] = seed / 4294967296
  }
  return values
})()

function hash(x: number, y: number, z: number): number {
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)
  return lattice[(h ^ (h >>> 13)) & (LATTICE_SIZE - 1)]
}

function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const a = hash(xi, yi, zi) + (hash(xi + 1, yi, zi) - hash(xi, yi, zi)) * u
  const b = hash(xi, yi + 1, zi) + (hash(xi + 1, yi + 1, zi) - hash(xi, yi + 1, zi)) * u
  const c = hash(xi, yi, zi + 1) + (hash(xi + 1, yi, zi + 1) - hash(xi, yi, zi + 1)) * u
  const d = hash(xi, yi + 1, zi + 1) + (hash(xi + 1, yi + 1, zi + 1) - hash(xi, yi + 1, zi + 1)) * u
  const e = a + (b - a) * v
  const f = c + (d - c) * v
  return e + (f - e) * w
}

function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * noise3(x * frequency, y * frequency, z + i * 7.3)
    frequency *= 2.03
    amplitude *= 0.5
  }
  return sum
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

type Ripple = { x: number; y: number; start: number; duration: number }

// Procedural idle membrane: domain-warped layered noise, drifting lit regions and rare soft ripples.
export function MembraneCanvas({ opacity = 1 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = context.createImageData(RESOLUTION, RESOLUTION)
    const pixels = image.data
    const ripples: Ripple[] = []
    let nextRippleAt = 3000 + Math.random() * 4000
    let frameId = 0
    let lastFrame = 0
    const origin = performance.now()

    const draw = (now: number) => {
      frameId = window.requestAnimationFrame(draw)
      if (now - lastFrame < FRAME_INTERVAL_MS) return
      lastFrame = now

      const elapsed = now - origin
      const t = elapsed * TIME_SCALE
      if (elapsed > nextRippleAt) {
        ripples.push({ x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6, start: elapsed, duration: 6000 + Math.random() * 3000 })
        nextRippleAt = elapsed + 7000 + Math.random() * 9000
      }
      while (ripples.length > 0 && elapsed - ripples[0].start > ripples[0].duration) ripples.shift()

      // Independently drifting lit regions.
      const blobs = [
        { x: 0.5 + 0.3 * Math.sin(t * 5.1), y: 0.5 + 0.26 * Math.cos(t * 4.3 + 1), r: 0.2 },
        { x: 0.5 + 0.34 * Math.cos(t * 3.7 + 2), y: 0.5 + 0.3 * Math.sin(t * 6.2), r: 0.17 },
        { x: 0.5 + 0.28 * Math.sin(t * 4.6 + 4), y: 0.5 + 0.32 * Math.cos(t * 3.1 + 3), r: 0.22 },
      ]

      let index = 0
      for (let py = 0; py < RESOLUTION; py += 1) {
        const ny = py / (RESOLUTION - 1)
        for (let px = 0; px < RESOLUTION; px += 1) {
          const nx = px / (RESOLUTION - 1)
          let x = nx * 2.6
          let y = ny * 2.6

          // Ripples gently displace the sampling position instead of drawing rings.
          let rippleLight = 0
          for (const ripple of ripples) {
            const age = (elapsed - ripple.start) / ripple.duration
            const dx = nx - ripple.x
            const dy = ny - ripple.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const front = age * 0.7
            const band = Math.exp(-(((distance - front) / 0.09) ** 2))
            const envelope = Math.sin(age * Math.PI)
            const wave = band * envelope
            x += (dx / (distance + 0.001)) * wave * 0.22
            y += (dy / (distance + 0.001)) * wave * 0.22
            rippleLight += wave * 0.1
          }

          const qx = fbm(x + t * 1.4, y - t * 0.9, t * 2, 3)
          const qy = fbm(x + 5.2 - t * 1.1, y + 1.3 + t * 1.2, t * 2 + 9, 3)
          const field = fbm(x + 3.2 * qx + t * 0.6, y + 3.2 * qy, t * 3 + 17, 4)
          const wisp = fbm(x * 1.7 - 2.1 * qy + t * 2.2, y * 1.7 + 2.1 * qx, t * 3 + 31, 3)

          let blobLight = 0
          for (const blob of blobs) {
            const bx = nx - blob.x
            const by = ny - blob.y
            blobLight += Math.exp(-(bx * bx + by * by) / (blob.r * blob.r))
          }

          const cx = nx - 0.5
          const cy = ny - 0.5
          const radius = Math.sqrt(cx * cx + cy * cy) * 2
          const darkCenter = 0.35 + 0.65 * smoothstep(0.05, 0.6, radius)
          const edgeFade = (1 - smoothstep(0.6, 1.0, Math.max(Math.abs(cx), Math.abs(cy)) * 2))
            * (1 - smoothstep(0.95, 1.4, radius))

          const cloud = smoothstep(0.3, 0.78, field)
          const thread = smoothstep(0.52, 0.8, wisp) * 0.45
          let energy = (cloud * (0.25 + 0.75 * Math.min(1, blobLight)) + thread * cloud + rippleLight) * darkCenter
          energy = Math.min(1, energy) * edgeFade

          const base = 0.1 * edgeFade * (0.6 + 0.4 * field)
          const level = base + energy * 0.72

          pixels[index] = 4 + level * 70
          pixels[index + 1] = 14 + level * 190
          pixels[index + 2] = 24 + level * 235
          pixels[index + 3] = Math.min(255, 30 + level * 520)
          index += 4
        }
      }
      context.putImageData(image, 0, 0)
    }

    frameId = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  return <canvas ref={canvasRef} className="membrane-canvas" style={{ opacity, transition: 'opacity 600ms ease' }} width={RESOLUTION} height={RESOLUTION} aria-hidden="true" />
}
