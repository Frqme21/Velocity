"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import { clamp01, hideNav, showNav, useStickyProgress } from "@/lib/scroll";

export default function VideoStory() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);

  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  const updateScroll = useCallback((progress: number) => {
    const frame = frameRef.current;
    const grid = gridRef.current;
    const stage = stageRef.current;

    const open = clamp01((progress - 0.16) / 0.58);
    const scale = 0.82 + 0.18 * open;

    if (frame) {
      frame.style.transform = `translate3d(-50%, -50%, 0) scale(${scale})`;
      frame.style.borderRadius = `${Math.round(24 * (1 - open))}px`;
    }

    if (grid) {
      grid.style.opacity = String(0.14 + progress * 0.2);
      grid.style.transform = `translate3d(0, ${progress * -48}px, 0)`;
    }

    stage?.classList.toggle("is-expanded", progress > 0.62);
  }, []);

  useStickyProgress(trackRef, updateScroll);

  const togglePaused = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (userPausedRef.current) {
      userPausedRef.current = false;
      setPaused(false);
      void video.play().catch(() => undefined);
      return;
    }

    userPausedRef.current = true;
    setPaused(true);
    video.pause();
  }, []);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    userPausedRef.current = false;
    setPaused(false);
    void video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) {
          hideNav();
          if (!userPausedRef.current) {
            void video.play().catch(() => undefined);
          }
        } else {
          showNav();
          video.pause();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(stage);
    return () => {
      observer.disconnect();
      showNav();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !inView) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
        return;
      }
      event.preventDefault();
      togglePaused();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inView, togglePaused]);

  return (
    <section id="physics" className="physics-section">
      <div className="video-heading">
        <h2>Every movement has math.</h2>
        <p>The frame opens as you scroll. Pause with Space at any time.</p>
      </div>

      <div ref={trackRef} className="video-track">
        <div ref={stageRef} className="video-stage">
          <div ref={gridRef} className="video-stage-grid" aria-hidden="true" />
          <div className="video-frame-shadow" aria-hidden="true" />

          <div
            ref={frameRef}
            className="video-frame"
            onClick={togglePaused}
            role="button"
            tabIndex={0}
            aria-label={paused ? "Resume video" : "Pause video"}
            onKeyDown={(event) => {
              if (event.key === "Enter") togglePaused();
            }}
          >
            <video
              ref={videoRef}
              className="video-element"
              poster={site.poster}
              preload="auto"
              autoPlay
              muted
              loop
              playsInline
              aria-label="Velocity physics explainer video"
            >
              <source src={site.video} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="video-controls">
            <button
              type="button"
              className="pause-control"
              onClick={togglePaused}
              aria-pressed={paused}
              aria-label={paused ? "Resume video" : "Pause video"}
            >
              {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
              <span>{paused ? "RESUME" : "PAUSE"}</span>
              <kbd>SPACE</kbd>
            </button>

            <button
              type="button"
              className="replay-control"
              onClick={replay}
              aria-label="Replay video from start"
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span>REPLAY</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
