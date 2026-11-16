# Velocity Movement Sandbox

A minimal Babylon.js + Rapier3D first-person movement sandbox.

## Controls

- `W` / `A` / `S` / `D` — move
- Mouse — look (click the canvas to capture the pointer)
- `Space` — jump
- `Shift` — ground dash or air dash when the white meter is full
- `Ctrl` — hold to slide; holding it while landing automatically starts a slide
- `Esc` — release the pointer

Movement uses one constant run speed with momentum-preserving ground and air control. Sliding has a forward impulse, short low-friction window, slope acceleration, locked-direction carving, slide-hopping, and speed-based camera FOV. The dash meter below the circular crosshair refills in 0.7 seconds. The mouse camera applies raw pointer-lock deltas directly without camera inertia or interpolation.

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
