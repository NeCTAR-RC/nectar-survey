/**
 * Applies the dialog's CSS inside a shadow root. The build makes the dialog
 * chunk push every stylesheet it imports (the library components' own CSS
 * and `styles.scss`) onto `window.__nectarSurveyCss` when it loads,
 * instead of into the document head, where it could neither reach the
 * shadow root nor stay out of the host page. See `vite.config.ts`.
 */

declare global {
  interface Window {
    /** CSS strings pushed by the build's injection code, in import order. */
    __nectarSurveyCss?: string[];
  }
}

let sharedSheet: CSSStyleSheet | undefined;
/** Shadow roots that already hold the fallback `<style>`. */
const styledRoots = new WeakSet<ShadowRoot>();

/** The collected CSS as one string; a script loaded twice adds no repeats. */
function collectedCss(): string {
  return [...new Set(window.__nectarSurveyCss ?? [])].join("\n");
}

/** True when shadow roots can adopt constructed stylesheets. */
function supportsAdoptedSheets(): boolean {
  return (
    "adoptedStyleSheets" in ShadowRoot.prototype &&
    "replaceSync" in CSSStyleSheet.prototype
  );
}

/**
 * Gives `root` the popup's styles: one constructed stylesheet shared by every
 * popup on the page, or a `<style>` element where constructed sheets are
 * unsupported. Called on every showing; a root is styled once. Must run
 * after the dialog chunk has loaded, since loading it pushes the CSS.
 */
export function adoptPopupStyles(root: ShadowRoot): void {
  if (supportsAdoptedSheets()) {
    if (!sharedSheet) {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(collectedCss());
    }
    root.adoptedStyleSheets = [sharedSheet];
    return;
  }
  if (styledRoots.has(root)) return;
  styledRoots.add(root);
  const style = document.createElement("style");
  style.textContent = collectedCss();
  root.prepend(style);
}
