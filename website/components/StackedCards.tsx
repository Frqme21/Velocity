"use client";

import {
  Crosshair,
  Gauge,
  Keyboard,
  Layers,
  PenLine,
  Route,
  Swords,
  Timer,
} from "lucide-react";
import RunReel from "@/components/RunReel";

const systems = [
  {
    icon: Gauge,
    title: "Momentum",
    copy: "Ground speed, air control, coyote time, and a forgiving jump window.",
  },
  {
    icon: Timer,
    title: "Sensory",
    copy: "Hold shift in the air to slow the world and read the next line.",
  },
  {
    icon: Crosshair,
    title: "Grapple",
    copy: "Rings enter a cone, then the pull locks to the chosen anchor.",
  },
  {
    icon: Swords,
    title: "Combat",
    copy: "Katana parries, homing shuriken, and enemies that punish hesitation.",
  },
  {
    icon: Route,
    title: "Campaign",
    copy: "Finish rings chain eight levels into one continuous run.",
  },
  {
    icon: PenLine,
    title: "Editor",
    copy: "Place geometry, colliders, spawns, and triggers directly in the scene.",
  },
  {
    icon: Layers,
    title: "Levels",
    copy: "Export and reload JSON with every transform and property intact.",
  },
  {
    icon: Keyboard,
    title: "Raw Look",
    copy: "Pointer lock input with no camera smoothing between you and the aim.",
  },
] as const;

export default function StackedCards() {
  return (
    <section id="systems" className="systems-section">
      <div className="systems-heading">
        <h2>Built to be felt.</h2>
        <p>Every input feeds the same simulation. Tune the level, then run it without a reload.</p>
      </div>

      <ul className="stack-list">
        {systems.map(({ icon: Icon, title, copy }, index) => (
          <li key={title} className="stack-item">
            <div className="stack-card-inner">
              <div className="stack-card-top">
                <div className="stack-icon">
                  <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <span className="stack-index tabular">
                  {String(index + 1).padStart(2, "0")} / {String(systems.length).padStart(2, "0")}
                </span>
              </div>
              <div className="stack-card-body">
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <RunReel />
    </section>
  );
}
