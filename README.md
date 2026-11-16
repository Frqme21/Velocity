# Velocity Movement Sandbox

A Babylon.js + Rapier3D first-person movement sandbox built around fast, arcade-style
traversal: a katana viewmodel, a dash, slides, wall-running, sensory-boost slow motion,
and a committed, high-speed grappling hook.

The grapple is the centrepiece — one tap fires the hook and pulls you straight at the
locked ring at speed, with no rope simulation, no pendulum swing, and a ledge vault that
carries you up and over the platform you hooked.

## Stack

| | |
|---|---|
| Engine | Babylon.js 9.37 (`@babylonjs/core`, `@babylonjs/loaders`) |
| Physics | Rapier3D `0.21.0` (`@dimforge/rapier3d-compat`) |
| Language | TypeScript (strict) |
| Build | Vite |

## Controls

| Input | Action |
|---|---|
| `W` / `A` / `S` / `D` | Move |
| Mouse | Look (click the canvas to capture the pointer) |
| `Space` | Jump |
| `Shift` (ground) | Dash toward your look direction when the white meter is full |
| `Shift` (air) | Hold to enter sensory boost: slow motion + teal overlay while the meter drains over 3 s |
| `A` / `D` (during sensory boost) | Short sideways evasive dash |
| Release `Shift` / let the meter empty (during sensory boost) | Short forward dash |
| `Ctrl` | Hold to slide; holding it while landing automatically starts a slide |
| Left mouse | Katana slash |
| Right mouse | Fire the grapple at the locked ring |
| `Esc` | Release the pointer |

The look is **raw pointer-lock** input with no camera smoothing — the camera always points
exactly where the mouse points.

## Movement

Movement uses a `10 m/s` base run speed with `0.3 s` coyote time, a `0.12 s` jump grace
window, and momentum-preserving ground/air control (air acceleration `14 m/s²`, air turn
rate `4.2`). Gravity is `20.32 m/s²`, multiplied by `1.5` while falling.

- **Dash** — `24 m/s` for `0.2 s`, recharging in `0.35 s`. The dash has a **vertical dead
  zone of `0.38 rad` (~22°)**: a slightly tilted view still produces a flat, horizontal
  dash, and only a deliberate look up or down adds vertical component.
- **Sensory boost** — in the air, `Shift` slows time to `20%` for up to `3 s`. The dash
  meter becomes a right-to-left boost timer, `A`/`D` fire short side dashes, and ending
  the boost fires a forward dash.
- **Slide** — bursts to `17 m/s` (max `18`, up to `32` downhill), can carve, throttle and
  brake, keeps momentum into slide-hops, and downhill slopes remove most friction
  (friction scale `0.08`) while adding speed.
- **Mantle** — nearby ledges up to `1.55 m` can be mantled over in `0.28 s` with a small
  forward push.
- **Wall run** — hold `W` next to a wall in the air to attach (max `2 s`), with camera
  roll, an entry boost, and a wall-jump that kicks off along the tangent.

The camera widens its FOV with speed, rolls into slides and wall-runs, and lowers its eye
offset while sliding.

## Grapple hook

The hook is deliberately arcade-fast rather than physically faithful.

**Targeting is forgiving.** A ring qualifies when it is inside `34 m`, inside a
`0.62 rad` (~36°) cone around the crosshair, and has a clear line to the player. The
line-of-sight check is a *sphere* cast (radius `0.4`), not a strict ray, so a ring that
is slightly off-centre or partly hidden behind a thin beam still locks on. The last
targeted ring gets a score bonus so the lock never flickers between two candidates, and
rings within `3.5 m` skip the visibility check entirely.

**The pull is a committed straight line.** Firing the hook:

- cancels downward velocity immediately, so the hook always catches you,
- keeps and boosts the horizontal speed you brought in,
- disables gravity for the duration of the pull.

There is no spring joint and no pendulum — the player is accelerated straight onto the
line to the anchor, ramping to `22 m/s` and up to `34 m/s`, easing off over the last
`7 m` so the arrival is a smooth approach rather than a hard stop.

**Jump and dash boost the pull, they never cancel it.** The pull is committed:

- `Space` adds a `7 m/s` upward kick that decays over `0.35 s` (with a `0.3 s` cooldown),
- `Shift` multiplies the pull speed by `1.35` for `0.5 s` and consumes the dash charge.

**The ledge vault.** Within `2.4 m` of the anchor the hook releases and pops the player
up and over the ledge. The player is never teleported onto the anchor — snapping the
capsule into the geometry used to shove it straight back down. Instead the vault applies
an upward impulse of `6.2 m/s` plus a forward speed *solved* so a ballistic arc lands on
the platform below the ring. Anchors carry an optional `landing` hint (the crane decks
do), so the landing is reliable from any approach angle.

**Juice.** The FOV widens by `0.09 rad` during the pull and eases back over `0.28 s`,
the camera leans into the travel direction, and a short launch shake fires on attach.

## Katana slash

Left mouse swings the katana. The swing lasts `0.2 s` with a `0.22 s` cooldown.

**The blade disappears and a laser takes over.** While the cut is in progress the steel
is hidden entirely and a procedural light trail is painted out of the blade tip instead.
The trail is a ribbon generated from scratch every frame along a quadratic Bézier path
in camera space, running from the upper right, bowing slightly upwards, and leaving
through the lower left. A custom additive shader gives it a hot white core with a cyan
glow that fades out along the tail. No extra model files are involved — it is all
geometry and a shader.

The hidden blade still rides the path: its tip is placed exactly on the trail head and
the blade is turned to follow the cut, so the light always comes out of the tip. When
the swing ends the blade reappears where the slash finished and eases back into its
resting pose over `0.12 s`.

**The hit.** On the impact frame (halfway through the swing) the game runs a forward
cone check: `3.4 m` range and a `75°` full-width cone around the crosshair, widened by
the target's own radius. A hit produces `35 ms` of hit-stop (the world freezes while
the viewmodel keeps moving), plays the katana slash sound, and **instantly refills the
dash meter**, so kills chain straight into the next rooftop traversal.

The target registry is intentionally decoupled from any enemy implementation:
`KatanaCombat` keeps a list of registered targets and asks each one to slice itself.
Future enemies plug into it by registering a target with a position, a radius and an
`onSlice` callback.

## Project structure

```
src/
  app/
    Game.ts                 scene wiring, render loop, HUD updates
    main.ts                 bootstrap
  audio/
    AudioManager.ts         sound playback with a small voice pool
  config/
    movement.ts             all movement tuning
    grapple.ts              all grapple tuning
    combat.ts               all melee + slash tuning
  input/
    InputManager.ts         keyboard + pointer-lock mouse, pointer-lock gated
  physics/
    PhysicsWorld.ts         Rapier world bootstrap
  ui/
    HUD.ts                  crosshair, dash meter, speed readout, speed lines
  world/
    FirstPersonController.ts  player movement, dash, slide, wall run, mantle, grapple
    Grappler.ts             targeting, ring visuals, cooldown
    KatanaViewmodel.ts      first-person katana, swing animation, slash visuals
    KatanaCombat.ts         melee target registry + cone check
    SlashTrail.ts           procedural laser-slash ribbon + additive shader
    maps/graybox.ts         the level and its grapple anchors
```

The player is a **kinematic** Rapier capsule. The controller integrates velocity itself
(`velX` / `velZ` / `vy`) and moves the body with `setNextKinematicTranslation`; Rapier's
character controller resolves collisions *after* the movement is computed. Impulses are
not available on kinematic bodies, so every push in this project is expressed as
velocity.

## Tuning

Every number that defines the feel lives in one of three files, with no magic values
scattered through the code:

- `src/config/movement.ts` — run speed, acceleration, gravity, dash, sensory boost,
  slide, mantle, camera response.
- `src/config/grapple.ts` — targeting cone/range/LOS, pull speed and response, detach
  distance, vault forces, jump/dash boosts, FOV kick, roll and shake.
- `src/config/combat.ts` — swing timing, hit cone and range, hit-stop, dash refill,
  slash trail width, colours and fade.

All three are plain `as const` objects, so tweaking a value and reloading is enough.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
```
