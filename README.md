# Velocity Movement Sandbox

A minimal Babylon.js + Rapier3D first-person movement sandbox.

## Controls

- `W` / `A` / `S` / `D` — move
- Mouse — look (click the canvas to capture the pointer)
- `Space` — jump
- `Shift` (ground) — dash toward your look direction when the white meter is full
- `Shift` (air) — hold to enter sensory boost: slow motion and a teal overlay while the meter drains over 3s
- `A` / `D` (during sensory boost) — short sideways evasive dash
- Release `Shift` or let the meter empty (during sensory boost) — short forward dash
- `Ctrl` — hold to slide; holding it while landing automatically starts a slide
- `Esc` — release the pointer

Movement uses a `10 m/s` base run speed with `0.3s` coyote time, momentum-preserving ground/air control, and raw pointer-lock camera input. `Shift` launches a `24 m/s` ground dash for `0.2s` in the current look direction and recharges quickly. In the air, `Shift` instead slows time to `20%` for up to `3s`; the dash meter becomes a right-to-left boost timer, `A`/`D` fire short side dashes, and ending the boost fires a forward dash. Sliding bursts to `17 m/s`, can carve/throttle/brake, keeps momentum into slide-hops, and downhill slopes remove most friction while adding speed. The controller can mantle nearby ledges and shows wind/speed indicators during fast movement. The HUD includes a circular crosshair, a dash meter below it, and speed/FPS readout.

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
