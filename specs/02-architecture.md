# 02 — Architecture and synchronization

## Views
- `/control`: private commands and status.
- `/portal`: renders visuals, plays video and audio, reports actual state.

Both open on same browser origin/profile on a single laptop. Use `BroadcastChannel` for communication; no server required beyond Vite local dev/preview serving.

## Authority
Portal owns authoritative playback/portal/audio state. Control sends typed commands and displays acknowledgments/status; it must not assume success on send.

## Protocol (initial proposal)
Typed messages with `type`, `id`, `sentAt`, and optional payload. Commands: `HELLO`, `SELECT_SCENARIO`, `START_SCENARIO`, `SEAL`, `SET_UNSTABLE`, `SET_VOLUME`, `FADE_TENSION`, `MUTE_ALL`, `CALIBRATE`. Portal emits `STATE_SNAPSHOT`, `ACK`, `ERROR`, `HEARTBEAT` as needed. Exact message names may evolve.

## Lifecycle
- Either view may open first; on connect, request snapshot.
- Portal reload initializes safely in CLOSED, no automatic media playback.
- Ignore or deduplicate repeated command IDs where relevant.
- Clean up BroadcastChannel listeners on unmount.
- If control disconnects, portal does not start new scenarios autonomously.
- Same-origin and same browser storage partition are required.

## State
Represent portal mode explicitly: `closed | opening | active | unstable | sealing` with selected scenario, playback status, audio status, error, calibration. Emergency seal cancels pending transitions and stale callbacks.
