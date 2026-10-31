# 06 — Audio System

## Purpose

Provide automatic soundtrack transitions for the Dimensional Control experience, with manual audio controls available to the operator.

The system supports three audio sources:

- **Ambient:** Looping background music while the portal is idle.
- **Activation:** A short cinematic buildup when opening the portal.
- **Video:** Native audio embedded in each anomaly video.

No separate tension tracks or sound-effect system are required.

## Playback Sequence

### Closed / Idle

- Play the selected ambient track continuously on a loop.
- Activation music is stopped.
- No scenario video is playing.

### Opening / Activation

- When the operator starts a scenario, smoothly fade down the ambient track.
- Begin playing the selected activation track.
- The opening sequence lasts 10 seconds by default.
- Keep the existing portal opening visuals active during this sequence.

### Active / Scenario Playback

- After the configured opening duration, begin the selected scenario video.
- Fade out any remaining activation audio.
- Play the video's native audio.
- Ambient music remains silent while the video is active.

### Sealing / Returning to Idle

- Stop the scenario video and its audio.
- Return to the existing closed portal membrane.
- Fade the selected ambient track back in over approximately 2–3 seconds.

### Emergency Seal

- Cancel any pending activation sequence.
- Stop the current video and activation music.
- Return the portal to its safe closed state.
- Restore ambient audio unless Emergency Silence is enabled.

The existing portal state machine owns transition timing. The audio system must not maintain a separate timer that controls when scenario videos begin.

## Audio Assets

Audio files are organized by purpose:

```text
public/audio/
├── ambient/
│   ├── laboratory.mp3
│   ├── whimsical.mp3
│   └── ominous.mp3
└── activation/
    ├── standard.mp3
    └── dramatic.mp3
```

These filenames are examples. The actual available tracks must be defined in a centralized audio registry.

### Audio Registry

The registry defines:

- Unique track identifier
- Display name
- Audio file path
- Track category (ambient or activation)
- Default selection for each category

Do not automatically discover files from the filesystem at runtime.

### Track Selection

- The operator can select an Ambient Track and an Activation Track independently.
- Each category has one default selection.
- Only one ambient track and one activation track may play at a time.
- Changing the ambient track while idle smoothly crossfades between the previous and newly selected tracks.
- Changing the activation selection affects the next activation sequence, not one already playing.
- Ambient tracks loop continuously.
- Activation tracks play once.
- Track selections persist during the current application session.
- Missing tracks must not interrupt portal operation.

Do not implement playlists, automatic track rotation, or file uploads.

## Operator Audio Controls

Add an Audio section to `/control` with:

- Ambient Track dropdown
- Activation Track dropdown
- Master Volume slider
- Ambient Volume slider
- Activation Volume slider
- Video Volume slider
- Automatic Audio toggle
- Emergency Silence / Restore Audio control
- Audio readiness and error indicator

### Volume Behavior

- Volume sliders define preferred playback levels.
- Automatic transitions temporarily adjust gain without overwriting slider settings.
- Master Volume affects ambient, activation, and native video audio.
- Video Volume affects only scenario video audio.
- Emergency Silence immediately mutes every audio source.
- Restoring audio resumes the appropriate soundtrack for the current portal state.

### Automatic Audio

When enabled, soundtrack playback follows the portal state machine automatically.

When disabled, automatic soundtrack transitions are suppressed while manual volume controls remain available.

Disabling Automatic Audio must not interrupt scenario video playback.

## Audio Architecture

- All audio playback occurs exclusively on `/portal`.
- `/control` sends commands through the existing BroadcastChannel.
- `/portal` owns the audio engine and reports actual playback state, readiness, and errors.
- Use the Web Audio API where appropriate for smooth fades and gain control.
- Native video audio must participate in master volume and Emergency Silence behavior.
- Avoid creating duplicate audio engines or playback instances during React rerenders.
- Keep audio configuration centralized and consistent with the existing application architecture.

### Browser Audio Initialization

Browsers may block audio playback until a user interacts with the page.

- Provide an Enable Audio interaction on `/portal` during initial setup.
- Initialize or resume the audio engine from that interaction.
- Report whether audio is ready to `/control`.
- Do not assume clicking a button on `/control` unlocks audio playback on `/portal`.
- Audio initialization failures must not prevent portal visuals or video playback.

## Synchronization and Timing

- The existing portal state machine is authoritative for opening, active, sealing, and closed transitions.
- The default opening duration is 10,000 milliseconds and must be centrally configurable.
- Audio playback reacts to portal state transitions.
- The activation audio file's actual duration must not determine when the video starts.
- If activation music exceeds the opening duration, fade or stop it when the video begins.
- If activation music ends early, the portal still waits for the configured opening duration.
- Replaying a scenario starts a new opening sequence.
- Canceling or sealing the portal invalidates any pending opening transition.
- Prevent duplicate activation cues or unintended overlapping ambient tracks.

## Reliability

- Missing or invalid audio files must not prevent scenario video playback.
- Repeated Play commands must not create overlapping activation sequences.
- Emergency Seal must cancel pending activation and return to the closed portal.
- Emergency Silence must immediately mute all sources without changing portal state.
- Audio can be deliberately restored after Emergency Silence.
- Audio errors should be visible to the operator without disrupting the show.
- Preserve existing video playback, scenario framing, calibration, fullscreen, and operator controls.

## Validation

Verify the following:

1. The selected ambient track loops while idle.
2. Changing ambient tracks while idle crossfades smoothly.
3. Starting a scenario fades down ambient music and plays the selected activation cue.
4. The scenario video begins after the configured opening duration.
5. Native video audio plays at the configured volume.
6. Ambient music returns after natural completion or manual close.
7. Ambient and activation track selectors work independently.
8. Master, Ambient, Activation, and Video volume controls affect the correct sources.
9. Emergency Silence mutes all audio.
10. Emergency Seal cancels activation and returns to the closed portal.
11. Replay starts a new activation sequence.
12. Audio plays exclusively from `/portal`.
13. Missing audio assets do not interrupt portal visuals or video playback.
14. Existing functionality remains intact.

Run the project's existing lint, type-check, and production build checks.