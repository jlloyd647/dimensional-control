# Dimensional Control

A local portal display for a projector-based Halloween experience. The current
implementation covers Phase 1 (portal display and calibration) and Phase 2
(scenario video playback) and Phase 3 (operator console synchronization).

## Run the portal

1. Install dependencies with `npm install` if they are not already installed.
2. Start the development server with `npm run dev`.
3. Open `http://localhost:5173/control` on the laptop.
4. In Windows display settings, choose **Extend these displays**. Open
   `http://localhost:5173/portal` in a second window and move it to the projector.
5. On the projector window, press **Ctrl+Alt+Shift+F** to enter fullscreen.
   Calibrate using **Ctrl+Alt+Shift+C** on the projector window or **Show
   calibration grid** on the console. Adjust projection scale, offsets, and
   horizontal mirror on the projector window, then hide calibration before the show.
6. On `/control`, select an encounter and use **Play**, **Replay**, **Close
   Portal**, or **Emergency Seal**. The console displays state reported by the
   portal, not assumed command outcomes. It reconnects automatically after
   either window reloads. **Set Unstable** adds a slow, low-intensity red
   interference effect; closing or emergency-sealing the portal clears it.

Operator shortcuts on `/control` (not active in form fields):

- **Ctrl+Alt+Shift+P** — Play the selected scenario.
- **Ctrl+Alt+Shift+C** — Close the portal through its sealing transition.
- **Ctrl+Alt+Shift+X** — Emergency Seal immediately.

The portal stays free of operator controls during normal playback. Its only
keyboard shortcuts are **Ctrl+Alt+Shift+C** for calibration and
**Ctrl+Alt+Shift+F** for fullscreen. The two windows synchronize over
same-origin `BroadcastChannel`; keep both on the same host and browser profile.

Calibration adjustments last for the current page session. Use the projector
window to adjust its calibration settings. Eight scenarios (Observer, Mimic,
Creature, Goliath, AI, Otherside, Woods, Storybook) load from
`public/videos/*.mp4`; each plays
once and returns the portal to CLOSED when it ends. Their typed scenario
configuration, including independent video positioning and ending behavior,
is in `src/scenarios.ts`.

## Build and lint

- `npm run build`
- `npm run lint`

See [specs/README.md](./specs/README.md) for the application specifications and
incremental implementation plan.
