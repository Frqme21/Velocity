# Velocity Movement Sandbox

A minimal Babylon.js + Rapier3D first-person movement sandbox.

## Controls

- `W` / `A` / `S` / `D` — move
- Mouse — look (click the canvas to capture the pointer)
- `Space` — jump
- `Esc` — release the pointer

Movement currently has one constant run speed with direct velocity control: pressing a movement key applies the target velocity immediately, and releasing the key stops horizontal movement immediately. The mouse camera also applies raw pointer-lock deltas directly without camera inertia or interpolation.

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
