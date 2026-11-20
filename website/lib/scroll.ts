"use client";

import { useLayoutEffect, type RefObject } from "react";

export const CUSTOM_SCROLL_EVENT = "velocity:scroll";
export const LOCK_SCROLL_EVENT = "velocity:lock-scroll";
export const UNLOCK_SCROLL_EVENT = "velocity:unlock-scroll";
export const HIDE_NAV_EVENT = "velocity:hide-nav";
export const SHOW_NAV_EVENT = "velocity:show-nav";

export function notifyScroll() {
  window.dispatchEvent(new Event(CUSTOM_SCROLL_EVENT));
}

export function lockScroll() {
  window.dispatchEvent(new Event(LOCK_SCROLL_EVENT));
}

export function unlockScroll() {
  window.dispatchEvent(new Event(UNLOCK_SCROLL_EVENT));
}

export function hideNav() {
  window.dispatchEvent(new Event(HIDE_NAV_EVENT));
}

export function showNav() {
  window.dispatchEvent(new Event(SHOW_NAV_EVENT));
}

export function subscribeScroll(callback: () => void) {
  callback();
  window.addEventListener("scroll", callback, { passive: true });
  window.addEventListener(CUSTOM_SCROLL_EVENT, callback);
  window.addEventListener("resize", callback);

  return () => {
    window.removeEventListener("scroll", callback);
    window.removeEventListener(CUSTOM_SCROLL_EVENT, callback);
    window.removeEventListener("resize", callback);
  };
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function stickyProgress(rect: DOMRect, viewport = window.innerHeight) {
  if (rect.height <= viewport) {
    return clamp01((viewport - rect.top) / (viewport + rect.height));
  }

  return clamp01((viewport - rect.top) / rect.height);
}

export function useStickyProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress: (progress: number, rect: DOMRect) => void,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      onProgress(stickyProgress(rect), rect);
    };

    return subscribeScroll(update);
  }, [ref, onProgress]);
}
