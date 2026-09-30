import { useEffect, type RefObject } from "react";

/**
 * Keeps a CSS custom property on `target` equal to the rendered height of
 * `source`, in pixels, for as long as the component is mounted. The value is
 * written straight to the element's style, so a resize never re-renders.
 */
export function useHeightProperty(
  source: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  property: `--${string}`,
): void {
  useEffect(() => {
    const measured = source.current;
    const holder = target.current;
    if (!measured || !holder) return;
    const write = (): void => {
      holder.style.setProperty(
        property,
        `${measured.getBoundingClientRect().height}px`,
      );
    };
    write();
    const observer = new ResizeObserver(write);
    observer.observe(measured);
    return () => {
      observer.disconnect();
      holder.style.removeProperty(property);
    };
  }, [source, target, property]);
}
