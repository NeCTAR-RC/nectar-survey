/**
 * Loads the Figtree font for the popup. A shadow root cannot declare
 * `@font-face` rules for itself, so they go into the host page's head, once.
 * Part of the dialog chunk: the font URLs in the built stylesheet are
 * resolved against that chunk's own URL, next to the fonts in `assets/`.
 */

import fontFaces from "./fonts.scss?inline";

const MARKER = "data-nectar-survey-fonts";

/**
 * True when the host page already declares a Figtree font face (for example
 * the Nectar Dashboard's own theme). `document.fonts.check()` cannot answer
 * this: Chromium returns true for a family with no declared faces at all.
 */
function hostDeclaresFigtree(): boolean {
  if (!document.fonts) return false;
  for (const face of document.fonts) {
    if (face.family.replace(/["']/g, "") === "Figtree") return true;
  }
  return false;
}

/**
 * Appends one `<style data-nectar-survey-fonts>` with the Figtree
 * `@font-face` rules to `document.head`, unless it is already there or the
 * host declares Figtree itself. If the fonts fail to load, the popup falls
 * back to the system font stack.
 */
export function injectFonts(): void {
  try {
    if (document.head.querySelector(`style[${MARKER}]`)) return;
    if (hostDeclaresFigtree()) return;
    const style = document.createElement("style");
    style.setAttribute(MARKER, "");
    style.textContent = fontFaces;
    document.head.append(style);
  } catch (error) {
    console.warn("nectar-survey: could not add fonts", error);
  }
}
