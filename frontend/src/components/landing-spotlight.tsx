"use client";

import { useEffect, useRef } from "react";

export default function LandingSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const finePointer = window.matchMedia("(pointer: fine)");

    if (prefersReducedMotion.matches || !finePointer.matches) {
      return;
    }

    let rafId = 0;
    let currentX = window.innerWidth * 0.68;
    let currentY = window.innerHeight * 0.24;
    let targetX = currentX;
    let targetY = currentY;

    const tick = () => {
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;

      ref.current?.style.setProperty("--spotlight-x", `${currentX}px`);
      ref.current?.style.setProperty("--spotlight-y", `${currentY}px`);
      rafId = window.requestAnimationFrame(tick);
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-[2] opacity-100"
      style={{
        background: `
          radial-gradient(38rem 38rem at var(--spotlight-x, 72%) var(--spotlight-y, 22%), rgba(123, 116, 255, 0.3), transparent 64%),
          radial-gradient(28rem 28rem at calc(var(--spotlight-x, 72%) - 10%) calc(var(--spotlight-y, 22%) + 10%), rgba(75, 149, 255, 0.17), transparent 66%),
          radial-gradient(20rem 20rem at calc(var(--spotlight-x, 72%) + 8%) calc(var(--spotlight-y, 22%) - 4%), rgba(173, 164, 255, 0.08), transparent 62%)
        `,
      }}
    />
  );
}
