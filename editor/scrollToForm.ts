/**
 * Moving the reader to a place in the survey form, for the Problems tab's
 * links and the survey list's rows. Both run once the form has rendered the
 * survey they point into.
 */

const FOCUSABLE =
  'input:not([type="hidden"]), textarea, [role="spinbutton"], button, [tabindex]:not([tabindex="-1"])';

/** Scrolls to a field's wrapper and focuses its first control. */
export function focusField(domId: string): void {
  const wrapper = document.getElementById(domId);
  if (!wrapper) return;
  wrapper.scrollIntoView({ block: "center" });
  const control = wrapper.matches(FOCUSABLE)
    ? wrapper
    : wrapper.querySelector<HTMLElement>(FOCUSABLE);
  (control ?? wrapper).focus({ preventScroll: true });
}

/**
 * Scrolls the top of an element into view when it is out of sight (above
 * the sticky header or below the window), and leaves focus where it is.
 * The element's `scroll-margin-top` is the room the header takes.
 */
export function revealTop(domId: string): void {
  const element = document.getElementById(domId);
  if (!element) return;
  const { top } = element.getBoundingClientRect();
  const hiddenAbove =
    top < parseFloat(getComputedStyle(element).scrollMarginTop);
  if (hiddenAbove || top > window.innerHeight) {
    element.scrollIntoView({ block: "start" });
  }
}
