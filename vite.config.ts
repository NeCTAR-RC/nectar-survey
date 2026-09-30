import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";

/*
 * Host services load the popup with one module script tag:
 *   <script type="module" src="https://<container-url>/nectar-survey.js"></script>
 * The build emits two parts:
 * - `nectar-survey.js`, a small ES module entry with a stable name. It runs
 *   on every page: attributes, config fetch, rules, storage and events. It
 *   holds no React and no CSS.
 * - `assets/dialog-<hash>.js`, the dialog with React, React Aria, the
 *   `@ardc-ui/react` components and all the popup's CSS. The entry loads it
 *   with `import("./dialog.tsx")` only when a survey is due. Its hashed name
 *   lets it be served immutable for a year.
 *
 * - The only bundler input is `src/index.ts`. An HTML input would make Vite
 *   rewrite and hash the entry, so `index.html` is kept out of the bundle
 *   graph and emitted separately by `demoPage()` below.
 * - `react()` compiles the JSX; a build defines `process.env.NODE_ENV` as
 *   production.
 * - The popup renders inside a shadow root, which document stylesheets cannot
 *   reach. Every stylesheet imported the normal way (the `@ardc-ui/react`
 *   components' own CSS and `src/popup/styles.scss`) is turned into JS by
 *   `vite-plugin-css-injected-by-js`, and no `.css` file is emitted. With
 *   `relativeCSSInjection` (which needs `cssCodeSplit: true`) each chunk
 *   carries the CSS it imports, so all of it lands in the dialog chunk and
 *   none in the entry. Its `injectCode` pushes the CSS onto
 *   `window.__nectarSurveyCss` rather than into the document head; the
 *   dialog adopts it into the shadow root once its chunk has loaded
 *   (`src/popup/shadowStyles.ts`). Dev mode does the same per file, so
 *   `pnpm dev` styles the shadow root too (a CSS edit there needs a reload).
 * - The one exception is `src/popup/fonts.scss`, imported with `?inline` as a
 *   string that goes into the document head, because a shadow root cannot
 *   declare `@font-face`. `?inline` CSS never reaches the plugin, so each
 *   stylesheet has exactly one delivery path. It is imported by the dialog
 *   side only.
 * - `assetsInlineLimit: 0` keeps fonts as real files under `assets/` (hashed,
 *   served immutable) instead of base64 inside a script.
 * - `base: "./"` makes every URL relative at runtime: the dialog chunk is
 *   imported relative to the entry, and asset URLs inside the `?inline`
 *   stylesheet are built from the importing chunk's `import.meta.url`. So
 *   the same build works at a container root (production) and under a CI
 *   preview prefix such as `/v1/AUTH_x/container/`. CI may still pass
 *   `--base=/some/path/`; that overrides this value and asset URLs become
 *   absolute under that path, which also works.
 * - Files in `public/` (`surveys.example.json`, `surveys.demo.json`) are
 *   copied to the `dist/` root as is. The live `surveys.json` is never built
 *   or deployed: it exists only in the Swift container (see
 *   `docs/editing-surveys.md`).
 */

const DEV_SCRIPT_TAG = '<script type="module" src="/src/index.ts"></script>';
const BUILT_SCRIPT_TAG =
  '<script type="module" src="./nectar-survey.js"></script>';

/**
 * Emits the demo page into `dist/index.html`, with the dev module script
 * swapped for the built entry, exactly as a host service loads it.
 * The relative `./` path keeps the demo working under any base.
 * Fails the build if the dev script tag is missing, so the demo can never
 * ship pointing at source files.
 */
function demoPage(): Plugin {
  return {
    name: "nectar-survey:demo-page",
    apply: "build",
    generateBundle() {
      const source = readFileSync(
        path.resolve(import.meta.dirname, "index.html"),
        "utf8",
      );
      if (!source.includes(DEV_SCRIPT_TAG)) {
        this.error(`index.html must contain exactly: ${DEV_SCRIPT_TAG}`);
      }
      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source: source.replace(DEV_SCRIPT_TAG, BUILT_SCRIPT_TAG),
      });
    },
  };
}

/** Vite's preload wrapper around a dynamic import, as `renderChunk` sees it. */
const PRELOAD_WRAPPER =
  /__vitePreload\(\(\) => (import\("[^"]+"\)), __VITE_PRELOAD__, import\.meta\.url\)/g;

/**
 * Turns the entry's `import()` of the dialog chunk back into a plain dynamic
 * import. Vite wraps every dynamic import in a preload helper that, when the
 * load fails, dispatches `vite:preloadError` on the host's `window`, and a
 * host built with Vite may reload the page on that event. The dialog chunk
 * has nothing to preload (no CSS files, and its only import is the entry
 * itself), and the element handles a failed load on its own. Without the
 * helper the minifier also drops its code from the entry.
 * Fails the build when the wrapper is not found exactly once, so a Vite
 * upgrade that changes it cannot pass unnoticed.
 */
function plainDynamicImport(): Plugin {
  return {
    name: "nectar-survey:plain-dynamic-import",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      if (!chunk.isEntry) return null;
      const found = code.match(PRELOAD_WRAPPER)?.length ?? 0;
      if (found !== 1) {
        this.error(
          `expected one preload wrapper in ${chunk.fileName}, found ${found}`,
        );
      }
      return { code: code.replace(PRELOAD_WRAPPER, "$1"), map: null };
    },
  };
}

/**
 * Collects the bundle's CSS for the shadow root instead of the document head.
 * `css` is the stylesheet as a JS string literal; the returned code runs at
 * the top of the dialog chunk, before the dialog module's own code. Keep the
 * global's name in step with `src/popup/shadowStyles.ts`.
 */
function shadowRootCss(css: string): string {
  return `(window.__nectarSurveyCss = window.__nectarSurveyCss || []).push(${css});`;
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    cssInjectedByJs({
      injectCode: shadowRootCss,
      relativeCSSInjection: true,
      dev: { enableDev: true },
    }),
    plainDynamicImport(),
    demoPage(),
  ],
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    rolldownOptions: {
      input: path.resolve(import.meta.dirname, "src/index.ts"),
      output: {
        format: "es",
        entryFileNames: "nectar-survey.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
