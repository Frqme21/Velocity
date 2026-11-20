"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Snap from "lenis/snap";
import { useEffect } from "react";
import {
  HIDE_NAV_EVENT,
  LOCK_SCROLL_EVENT,
  SHOW_NAV_EVENT,
  UNLOCK_SCROLL_EVENT,
  notifyScroll,
  subscribeScroll,
} from "@/lib/scroll";

export default function ScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const root = document.documentElement;
    let frame = 0;
    let lastY = window.scrollY;
    let lastTime = performance.now();

    const lenis = new Lenis({
      anchors: true,
      lerp: 0.12,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      respectReducedMotion: true,
    });

    // Magnetic snap points for the videos. Rebuilt after layout settles and on resize.
    const snap = new Snap(lenis, {
      type: "proximity",
      distanceThreshold: "35%",
      debounce: 350,
      lerp: 0.09,
    });

    const snapRemovers: Array<() => void> = [];

    const addSnapTargets = () => {
      snapRemovers.forEach((remove) => remove());
      snapRemovers.length = 0;

      const videoTrack = document.querySelector<HTMLElement>(".video-track");
      const reel = document.querySelector<HTMLElement>(".run-reel");

      if (videoTrack) {
        const rect = videoTrack.getBoundingClientRect();
        const trackTop = rect.top + window.scrollY;
        // Frame is full viewport at open=1, which is progress=0.74 in VideoStory.
        const fullProgress = 0.74;
        const nudge = window.innerHeight * 0.12;
        const offset = Math.max(0, fullProgress * rect.height - window.innerHeight - nudge);
        snapRemovers.push(snap.add(trackTop + offset));
      }

      if (reel) {
        const reelTop = reel.getBoundingClientRect().top + window.scrollY;
        snapRemovers.push(snap.add(reelTop));
      }
    };

    const syncLayout = () => {
      ScrollTrigger.refresh();
      addSnapTargets();
    };

    const refreshTimer = window.setTimeout(syncLayout, 200);
    void document.fonts?.ready.then(syncLayout);

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(syncLayout, 150);
    };
    window.addEventListener("resize", onResize);

    const update = () => {
      frame = 0;
      const now = performance.now();
      const y = window.scrollY;
      const elapsed = Math.max(16, now - lastTime);
      const velocity = (y - lastY) / elapsed;

      root.style.setProperty(
        "--scroll-skew",
        `${Math.max(-6, Math.min(6, velocity * 10)).toFixed(2)}deg`,
      );

      lastY = y;
      lastTime = now;
    };

    const request = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    const onLenisScroll = () => {
      notifyScroll();
      request();
      ScrollTrigger.update();
    };

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };

    const onLock = () => lenis.stop();
    const onUnlock = () => lenis.start();
    const onHideNav = () => root.classList.add("nav-hidden");
    const onShowNav = () => root.classList.remove("nav-hidden");

    const offLenis = lenis.on("scroll", onLenisScroll);
    const unsubscribe = subscribeScroll(request);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    window.addEventListener(LOCK_SCROLL_EVENT, onLock);
    window.addEventListener(UNLOCK_SCROLL_EVENT, onUnlock);
    window.addEventListener(HIDE_NAV_EVENT, onHideNav);
    window.addEventListener(SHOW_NAV_EVENT, onShowNav);

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      snapRemovers.forEach((remove) => remove());
      snap.destroy();
      offLenis();
      unsubscribe();
      gsap.ticker.remove(tick);
      window.removeEventListener(LOCK_SCROLL_EVENT, onLock);
      window.removeEventListener(UNLOCK_SCROLL_EVENT, onUnlock);
      window.removeEventListener(HIDE_NAV_EVENT, onHideNav);
      window.removeEventListener(SHOW_NAV_EVENT, onShowNav);
      lenis.destroy();
      if (frame !== 0) cancelAnimationFrame(frame);
      root.classList.remove("nav-hidden");
      root.style.setProperty("--scroll-skew", "0deg");
    };
  }, []);

  return <>{children}</>;
}
