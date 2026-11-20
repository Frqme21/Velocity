"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { hideNav, showNav } from "@/lib/scroll";
import { site } from "@/lib/site";

export default function RunReel() {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const replay = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;

    video.currentTime = 0;
    void video.play().catch(() => undefined);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        videoRefs.current.forEach((video) => {
          if (!video) return;
          if (entry.isIntersecting) {
            hideNav();
            void video.play().catch(() => undefined);
          } else {
            showNav();
            video.pause();
          }
        });
      },
      { threshold: 0.12 },
    );

    observer.observe(root);
    return () => {
      observer.disconnect();
      showNav();
    };
  }, []);

  return (
    <div ref={rootRef} className="run-reel" aria-label="Gameplay clips">
      {site.reel.map((clip, index) => (
        <figure key={clip.src} className="reel-card">
          <video
            ref={(element) => {
              videoRefs.current[index] = element;
            }}
            className="reel-video"
            poster={clip.poster}
            preload="metadata"
            muted
            loop
            playsInline
            aria-label={clip.label}
          >
            <source src={clip.src} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <figcaption className="reel-caption">{clip.label}</figcaption>
          <button
            type="button"
            className="reel-replay"
            onClick={() => replay(index)}
            aria-label={`Replay ${clip.label} from start`}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>REPLAY</span>
          </button>
        </figure>
      ))}
    </div>
  );
}
