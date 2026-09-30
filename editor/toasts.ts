import { createToastQueue, type ToastContent } from "@ardc-ui/react";

/** The editor's one toast queue, shown by the `ToastRegion` in `App`. */
export const toasts = createToastQueue({ maxVisibleToasts: 3 });

/** How long a success or info toast stays before it goes by itself. */
const SELF_DISMISS_MS = 6000;

/**
 * Raises a toast. Success and info toasts dismiss themselves after a few
 * seconds; warnings and errors stay until the reader closes them, so a
 * problem is never missed.
 */
export function notify(content: ToastContent): void {
  const tone = content.tone ?? "info";
  const lasting = tone === "warning" || tone === "danger";
  toasts.add(
    { ...content, tone },
    lasting ? undefined : { timeout: SELF_DISMISS_MS },
  );
}
