"use client";

import { useLayoutEffect } from "react";
import { clamp01, subscribeScroll } from "@/lib/scroll";

type BaseRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export default function BrandMotion() {
  useLayoutEffect(() => {
    const hero = document.getElementById("hero");
    const mark = document.getElementById("hero-mark-motion");
    const slot = document.getElementById("nav-mark-slot");
    const word = document.getElementById("nav-word");
    if (!hero || !mark || !slot || !word) return;

    let base: BaseRect | null = null;
    let resizeTimer = 0;
    let disposed = false;

    const place = () => {
      if (!base) return;

      const travel = Math.max(1, hero.offsetHeight * 0.72);
      const progress = clamp01(window.scrollY / travel);
      const naturalLeft = base.left - window.scrollX;
      const naturalTop = base.top - window.scrollY;
      const target = slot.getBoundingClientRect();
      const scale = target.width / base.width;
      const dx = target.left - naturalLeft;
      const dy = target.top - naturalTop;
      const reveal = clamp01((progress - 0.5) / 0.3);

      mark.style.transform = `translate3d(${dx * progress}px, ${dy * progress}px, 0) scale(${1 + (scale - 1) * progress})`;
      word.style.opacity = String(reveal);
      word.style.transform = `translate3d(${(1 - reveal) * -16}px, 0, 0)`;
    };

    const measure = () => {
      const previous = mark.style.transform;
      mark.style.transform = "none";
      const rect = mark.getBoundingClientRect();
      base = {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
      mark.style.transform = previous;
      place();
    };

    const requestMeasure = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measure, 120);
    };

    measure();
    const unsubscribeScroll = subscribeScroll(place);
    window.addEventListener("resize", requestMeasure);
    void document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });

    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      unsubscribeScroll();
      window.removeEventListener("resize", requestMeasure);
    };
  }, []);

  return null;
}
