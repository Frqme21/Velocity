# Velocity physics explainer

Script: `physics_explainer.py`
Scene: `VelocityPhysics`
Output: `physics_of_velocity.mp4` (also in `media/videos/physics_explainer/1080p60/`)

The video explains the simulation clock, ground acceleration and jump, dash vector, sensory time scale, grapple targeting and vault, projectile and shuriken motion, the Mech's snapshotted laser wall, and the final tuning numbers.

All on-screen typography uses the locally installed `Monochrome Aviation` font family.

Re-render with:

```bash
python3 -m manim render -qh \
  --media_dir /home/frqme/Desktop/projects/Velocity/manim/media \
  -o physics_of_velocity \
  /home/frqme/Desktop/projects/Velocity/manim/physics_explainer.py \
  VelocityPhysics
```
