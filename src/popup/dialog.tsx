/**
 * The React side of the popup. The element loads this module with a dynamic
 * `import()` only when a survey is due, so React, React Aria, the library and
 * the popup's CSS travel in their own chunk and stay out of the entry script
 * that runs on every page. Everything that pulls them in belongs here or
 * below: the shadow DOM flag, the portal, the React root, `SurveyDialog`,
 * the shadow root styles and the fonts.
 */

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { UNSAFE_PortalProvider } from "react-aria";
import { enableShadowDOM } from "react-stately/private/flags/flags";
import { injectFonts } from "./fonts.ts";
import { adoptPopupStyles } from "./shadowStyles.ts";
import { SurveyDialog, type SurveyDialogProps } from "./SurveyDialog.tsx";

// The library's dialog fades out over 200ms. The React tree is torn down
// after twice that, so the fade is never cut short.
const DIALOG_EXIT_MS = 400;

/*
 * React Aria's focus and overlay code must know the dialog lives in a shadow
 * root. Without this flag, the Modal's ariaHideOutside cannot see that
 * <body> contains the dialog (its containment check stops at the shadow
 * boundary) and marks <body> inert, dialog included: no focus, no Escape, no
 * clicks. The flag is set once, when this module first loads, before the
 * first render.
 *
 * `react-stately/private/flags/flags` is a private path. react-stately is
 * exact-pinned to the version react-aria-components resolves, so both see
 * the same flag module; when a dependency bump moves or renames the flag,
 * the Playwright suite fails on focus, Escape and clicks.
 */
enableShadowDOM();

/** What the element hands the dialog: the survey, the service, callbacks. */
export interface MountDialogOptions extends SurveyDialogProps {
  /**
   * A render error, first or later. The dialog has already removed itself
   * when this is called.
   */
  onError: (error: unknown) => void;
}

/** A rendered dialog. */
export interface MountedDialog {
  /** Removes the dialog at once; later calls do nothing. */
  unmount(): void;
}

/**
 * Renders the survey dialog into `shadow` and returns once it is on the
 * page. The render is flushed synchronously, so the caller knows it worked
 * before it records the showing. Returns undefined when the first render
 * failed (the error has gone to `onError` and nothing is left behind).
 *
 * After the user's choice has been passed on, the dialog removes itself once
 * its fade is over.
 */
export function mountDialog(
  shadow: ShadowRoot,
  { onError, onStart, onLater, onDismiss, ...dialogProps }: MountDialogOptions,
): MountedDialog | undefined {
  adoptPopupStyles(shadow);
  injectFonts();

  const mountPoint = document.createElement("div");
  // React Aria portals the scrim and panel here, inside the shadow root,
  // where the popup's styles apply and the host's do not.
  const overlayLayer = document.createElement("div");
  overlayLayer.className = "overlayLayer";
  shadow.append(mountPoint, overlayLayer);

  let mounted = true;
  const root = createRoot(mountPoint, {
    onUncaughtError: (error) => {
      unmount();
      onError(error);
    },
  });

  function unmount(): void {
    if (!mounted) return;
    mounted = false;
    // Deferred because this can run inside a React callback (onUncaughtError),
    // where a synchronous unmount is not allowed. The tree leaves the page
    // at once regardless, with the nodes it was rendered into.
    queueMicrotask(() => root.unmount());
    mountPoint.remove();
    overlayLayer.remove();
  }

  /** Passes a choice on, then tears the tree down after the fade. */
  function thenFadeOut<Args extends unknown[]>(
    choice: (...args: Args) => void,
  ): (...args: Args) => void {
    return (...args) => {
      choice(...args);
      window.setTimeout(unmount, DIALOG_EXIT_MS);
    };
  }

  flushSync(() => {
    root.render(
      <UNSAFE_PortalProvider getContainer={() => overlayLayer}>
        <SurveyDialog
          {...dialogProps}
          onStart={thenFadeOut(onStart)}
          onLater={thenFadeOut(onLater)}
          onDismiss={thenFadeOut(onDismiss)}
        />
      </UNSAFE_PortalProvider>,
    );
  });

  return mounted ? { unmount } : undefined;
}
