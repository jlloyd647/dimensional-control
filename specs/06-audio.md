# 06 — Audio engine

## Ownership
Audio engine runs only in `/portal`, avoiding duplicate playback. Explicit user interaction on portal is required to unlock audio when browser autoplay policies demand it; surface readiness/error status on `/control`.

## Channels
- **Ambient**: seamless looping lab hum / machinery.
- **Tension**: looping drones and suspense layers, manually faded.
- **Effects**: one-shot portal activation, impacts, alarms, sealing.
- **Master**: controls final mix.

## Requirements
Web Audio API with separate GainNodes, smooth scheduled gain ramps, configurable fades, no duplicate loops, independent levels, immediate global mute, restore only by explicit action. Cancel/reconcile in-progress fades when new commands arrive.

## Suggested cues
Closed: quiet ambient. Opening: fade ambient down, dimensional drone in. Investigation: raise tension. Breach: impact/alarm and reduced ambient. Seal: impact then tension fades out, ambient returns. Silence: all channels muted immediately.

## Failure behavior
Audio error never prevents visual show; report error. Keep audio file paths configurable and local. Verify speaker output in setup.
