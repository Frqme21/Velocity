import Image from "next/image";
import { ArrowDown } from "lucide-react";
import BrandMotion from "@/components/BrandMotion";
import BrandSplit from "@/components/BrandSplit";
import MagneticButton from "@/components/MagneticButton";
import ScrollProvider from "@/components/ScrollProvider";
import StackedCards from "@/components/StackedCards";
import VideoStory from "@/components/VideoStory";
import { site } from "@/lib/site";

const controls = [
  { key: "WASD", label: "Move" },
  { key: "MOUSE", label: "Look" },
  { key: "SPACE", label: "Jump" },
  { key: "SHIFT", label: "Dash or sensory boost" },
  { key: "CTRL", label: "Slide" },
  { key: "LMB", label: "Slash and parry" },
  { key: "RMB", label: "Grapple" },
  { key: "Q", label: "Shuriken" },
  { key: "R", label: "Reset" },
] as const;

export default function Home() {
  return (
    <ScrollProvider>
      <div className="site-shell">
        <BrandMotion />

        <header className="site-header">
          <a id="nav-brand" className="nav-brand" href="#hero" aria-label="Velocity home">
            <span id="nav-mark-slot" className="nav-mark-slot" aria-hidden="true" />
            <span id="nav-word" className="nav-word">
              VELOCITY<span>.</span>
            </span>
          </a>

          <nav className="nav-links" aria-label="Main navigation">
            <a className="nav-link" href="#physics">
              Video
            </a>
            <a className="nav-link" href="#systems">
              Systems
            </a>
            <a className="nav-link" href="#controls">
              Controls
            </a>
          </nav>
        </header>

        <main>
          <section id="hero" className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <h1 id="hero-title" className="hero-title">
                <span>Feel every</span>
                <span>move.</span>
              </h1>
              <p className="hero-sub">
                First person parkour, real physics, and a live level editor.
              </p>
              <div className="hero-actions">
                <MagneticButton href={site.gameUrl}>Play the game</MagneticButton>
              </div>
            </div>

            <div id="hero-mark-anchor" className="hero-mark" aria-hidden="true">
              <div id="hero-mark-motion" className="hero-mark-motion">
                <Image src={site.mark} alt="" fill sizes="360px" priority />
              </div>
            </div>

            <a className="scroll-cue" href="#physics">
              <ArrowDown size={16} strokeWidth={2} aria-hidden="true" />
              Scroll to see more
            </a>
          </section>

          <VideoStory />
          <BrandSplit />
          <StackedCards />

          <section id="controls" className="controls-section">
            <div className="controls-heading">
              <h2>Controls, no clutter.</h2>
              <p>Everything is bound to the same pointer locked simulation.</p>
            </div>
            <div className="controls-marquee" data-lenis-prevent aria-label="Game controls">
              {controls.map(({ key, label }) => (
                <div className="control-chip" key={key}>
                  <kbd>{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="play" className="play-section" aria-labelledby="play-title">
            <div className="play-card">
              <h2 id="play-title">Ready to run?</h2>
              <p>Open the game, pick a level, or build your own course.</p>
              <MagneticButton href={site.gameUrl}>Play the game</MagneticButton>
            </div>
          </section>
        </main>

        <footer className="site-footer">
          <Image
            className="footer-mark"
            src={site.wordmark}
            alt="Velocity game"
            width={240}
            height={64}
          />
          <p className="footer-note">Made by Frqme</p>
        </footer>
      </div>
    </ScrollProvider>
  );
}
