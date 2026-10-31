# 07 — Reliability and physical safety

## Emergency seal
From any state, immediately cancel timers/transitions, stop scenario video, clear scenario visuals, return to CLOSED, stop/fade scenario-specific sounds, and restore default ambient if not globally muted.

## Emergency silence
Immediately mute all channels; do not automatically unmute on scene changes.

## Failure cases
- Missing/unsupported video: CLOSED + operator error.
- Audio failure: visuals continue + operator error.
- Portal reload: CLOSED and await operator input.
- Control disconnected: no new automated events.
- Repeated clicks: idempotent or safe transitions.
- Ensure cleanup of media, audio nodes, event listeners, animation frames and timers.

## Physical safety
No browser-controlled laser aim/output in MVP. Any lasers must use independent, safe, manufacturer-approved operation and be isolated from visitor eye lines and public roads. Fog and lighting should not obstruct safe movement or exits. Avoid high-frequency strobe effects. Physical emergency stop and power control remain independent of the app.
