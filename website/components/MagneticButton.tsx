"use client";

import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { useEffect, useRef } from "react";

export default function MagneticButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const quickX = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const quickY = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
    const radius = 48;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - Number(gsap.getProperty(el, "x"));
      const cy = rect.top + rect.height / 2 - Number(gsap.getProperty(el, "y"));
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const reach = Math.max(rect.width, rect.height) / 2 + radius;

      if (distance < reach) {
        const pull = 1 - distance / reach;
        quickX(dx * 0.22 * pull);
        quickY(dy * 0.22 * pull);
      } else {
        quickX(0);
        quickY(0);
      }
    };

    const onLeave = () => {
      quickX(0);
      quickY(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, []);

  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`magnetic-button ${className}`.trim()}
    >
      <span>{children}</span>
      <ArrowUpRight size={18} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}
