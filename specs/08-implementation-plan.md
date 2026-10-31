# 08 — Implementation phases and acceptance

Only implement the current phase. Test on actual projection material between phases.

## Phase 1 — Portal foundation
Vite React TS setup; `/portal` closed animated membrane; fullscreen; calibration pattern and scale/offset/mirror.
**Accept:** Portal runs indefinitely on projector and fits 5×5-foot membrane.

## Phase 2 — Scenario video
Typed scenario configuration; The Observer MP4; opening/active/sealing; return closed on end; error handling.
**Accept:** Clip plays once, finishes cleanly, and can be interrupted.

## Phase 3 — Operator console
`/control`, BroadcastChannel commands/state sync, selection, start, instability, seal, connection/errors.
**Accept:** Laptop operates projector without exposing controls to audience; reconnect works.

## Phase 4 — Audio
Web Audio mixer, ambient/tension/effects/master, fades, cues, mute, audio enable flow.
**Accept:** Quiet tension can be built/released while visuals play, with no duplicate loops.

## Phase 5 — Polish
Shortcuts, preloading, additional encounters, recovery testing, performance tuning.
**Accept:** Multiple encounters run without restarting the app.

## First Copilot task
Read all files in `spec/`, but implement **Phase 1 only**. First explain proposed files and dependencies briefly. Then build the smallest implementation and give instructions to test it with laptop in extended-display mode and projector fullscreen. Do not implement control, audio, or scenarios yet.
