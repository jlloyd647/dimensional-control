# 04 — Scenarios and media

## Scenario configuration
Data-driven TypeScript entries: `id`, `name`, `description`, `videoPath`, `loop`, `onEnd`, optional `audioPaths`, `visualSettings`, `actions`. No hardcoded per-creature UI.

## Initial scenario: The Observer
A towering featureless, unnaturally thin humanoid with long claws enters the frame, notices the viewer, investigates the invisible barrier, attempts to break through, then vanishes. Approximately 10-second prerecorded clip. After end: return to CLOSED.

## Media behavior
- Local assets in `public/videos/` and `public/audio/`.
- Browser-compatible MP4 and audio formats.
- Preload selected clip when practical; don't load all future assets by default.
- Detect ended, load failure, decode failure, and rejected playback.
- No native video controls, preserve aspect ratio, support optional loop.
- Do not display simulated plastic/fog overlays by default; physical membrane supplies diffusion.

## Future examples, not MVP
The Many, The Blob, The Mimic, The Colossus. Multiple clips/actions per encounter can be added later.
