# Velocity Movement Sandbox

A minimal Babylon.js + Rapier3D first-person movement sandbox.

## Controls

- `W` / `A` / `S` / `D` — move
- Mouse — look (click the canvas to capture the pointer)
- `Space` — jump
- `Shift` — ground dash or air dash when the white meter is full
- `Esc` — release the pointer

Movement uses one constant run speed with momentum-preserving ground and air control. The dash meter below the circular crosshair refills in one second. The mouse camera applies raw pointer-lock deltas directly without camera inertia or interpolation.

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
