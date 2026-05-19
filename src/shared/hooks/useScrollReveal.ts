import { useEffect } from "react";

export function useScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("reveal-ready");

    if (prefersReducedMotion) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return () => root.classList.remove("reveal-ready");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.12,
      },
    );

    targets.forEach((target) => {
      const rect = target.getBoundingClientRect();
      const isAlreadyInView = rect.top < window.innerHeight && rect.bottom > 0;

      if (isAlreadyInView) {
        target.classList.add("is-visible");
        return;
      }

      observer.observe(target);
    });

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
}
