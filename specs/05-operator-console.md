# 05 — Operator console

## Design
Dark, industrial, scientific control panel. Large, readable buttons for use in low light while roleplaying. Minimal clutter and clear active state.

## MVP controls
- Select scenario, start/replay, stop/emergency seal.
- Trigger unstable effect, return to closed.
- See current portal state, selected scenario, video status, connection status, errors.
- Projection calibration mode.

## Audio controls (phase 4)
Master, ambient, tension, effects volumes; fade tension up/down; emergency silence; audio initialization status.

## Shortcuts (later polish)
Start scenario, seal, instability, silence; document bindings and avoid browser shortcut conflicts. Always support mouse input.

## Command feedback
Show pending command until acknowledged; report failure or disconnected portal. Never falsely show 'playing' merely because Start was clicked.
