/**
 * The editor's contact with the outside world: the published file, the
 * template, local files, downloads and the clipboard. Every path is relative
 * to the page, which is served from the container root next to
 * `surveys.json` and `nectar-survey.js`.
 */

import type { LiveFetch } from "./state.ts";

export const LIVE_FILE = "./surveys.json";
export const TEMPLATE_FILE = "./surveys.example.json";
export const DOWNLOAD_NAME = "surveys.json";

/**
 * Reads the published file. A 404 (or an HTML page in its place) means
 * nothing is published yet.
 */
export async function fetchLive(): Promise<LiveFetch> {
  try {
    const response = await fetch(LIVE_FILE, { cache: "no-store" });
    // Some servers answer a missing file with an HTML page and status 200
    // (Vite's preview server does); a real config is never HTML.
    const isHtml =
      response.headers.get("Content-Type")?.includes("text/html") ?? false;
    if (response.status === 404 || (response.ok && isHtml)) {
      return { status: "missing" };
    }
    if (!response.ok) {
      return {
        status: "failed",
        message: `The server answered ${[response.status, response.statusText].filter(Boolean).join(" ")}.`,
      };
    }
    return {
      status: "found",
      text: await response.text(),
      at: new Date().toISOString(),
    };
  } catch {
    return {
      status: "failed",
      message: "The request did not reach the server. Check the connection.",
    };
  }
}

/** Reads the template that ships with the editor. Throws a readable error. */
export async function fetchTemplate(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(TEMPLATE_FILE, { cache: "no-store" });
  } catch {
    throw new Error("The template could not be loaded. Check the connection.");
  }
  if (!response.ok) {
    throw new Error(`The template could not be loaded (${response.status}).`);
  }
  return response.text();
}

/** Offers `text` to the browser as a file download named `name`. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next task, once the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Copies `text` to the clipboard; resolves false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Formats an ISO time as a short local time, such as "9:40 pm". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}
