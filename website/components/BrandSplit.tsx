"use client";

import Image from "next/image";
import { useCallback, useRef } from "react";
import { site } from "@/lib/site";
import { clamp01, useStickyProgress } from "@/lib/scroll";

const pieces = [
  {
    key: "top-left",
    clip: "polygon(0 0, 50% 0, 50% 50%, 0 50%)",
    x: -208,
    y: -168,
    rotate: -8,
  },
  {
    key: "top-right",
    clip: "polygon(50% 0, 100% 0, 100% 50%, 50% 50%)",
    x: 208,
    y: -168,
    rotate: 8,
  },
  {
    key: "bottom-left",
    clip: "polygon(0 50%, 50% 50%, 50% 100%, 0 100%)",
    x: -208,
    y: 168,
    rotate: 8,
  },
  {
    key: "bottom-right",
    clip: "polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)",
    x: 208,
    y: 168,
    rotate: -8,
  },
] as const;

export default function BrandSplit() {
  const sectionRef = useRef<HTMLElement>(null);
  const pieceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const coreRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  const updateScroll = useCallback((progress: number) => {
    const split = clamp01(progress / 0.6);
    const rebuild = clamp01((progress - 0.68) / 0.32);
    const spread = split * (1 - rebuild);

    pieces.forEach((piece, index) => {
      const node = pieceRefs.current[index];
      if (!node) return;
      node.style.transform = `translate3d(${piece.x * spread}px, ${piece.y * spread}px, 0) rotate(${piece.rotate * spread}deg) scale(${1 + 0.08 * spread})`;
    });

    if (coreRef.current) {
      const appear = clamp01((progress - 0.2) / 0.2);
      const leave = 1 - clamp01((progress - 0.74) / 0.18);
      coreRef.current.style.opacity = String(appear * leave);
      coreRef.current.style.transform = `translate3d(0, ${(1 - appear) * 40 - (1 - leave) * 32}px, 0) scale(${0.92 + appear * 0.08})`;
    }

    if (markRef.current) {
      markRef.current.style.transform = `translate3d(0, ${progress * -32}px, 0)`;
    }
  }, []);

  useStickyProgress(sectionRef, updateScroll);

  return (
    <section ref={sectionRef} className="brand-split" aria-labelledby="brand-split-title">
      <div className="brand-split-stage">
        <div className="brand-split-orbit" aria-hidden="true" />
        <div className="brand-split-orbit brand-split-orbit-small" aria-hidden="true" />

        <div ref={markRef} className="brand-split-mark" aria-hidden="true">
          {pieces.map((piece, index) => (
            <div
              key={piece.key}
              ref={(element) => {
                pieceRefs.current[index] = element;
              }}
              className="brand-split-piece"
              style={{ clipPath: piece.clip }}
            >
              <Image src={site.mark} alt="" fill sizes="480px" />
            </div>
          ))}
        </div>

        <div ref={coreRef} className="brand-split-core">
          <h2 id="brand-split-title">Input becomes motion.</h2>
          <p>Every system reads the same frame. Change the level and the result changes with it.</p>
        </div>

      </div>
    </section>
  );
}
