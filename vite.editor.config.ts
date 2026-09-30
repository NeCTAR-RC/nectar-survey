import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/*
 * The config editor: a normal React app build, run after the popup build
 * (`vite.config.ts`) and written into the same `dist/`.
 *
 * - `root: "editor"` keeps `editor/index.html` as the entry; `editorPage()`
 *   emits it as `dist/editor.html`, so it sits at the container root next to
 *   `surveys.json` and `nectar-survey.js` and never replaces the demo page.
 * - `emptyOutDir: false` keeps the popup build's files. The named input makes
 *   the hashed files `assets/editor-*.js` and `assets/editor-*.css`; fonts
 *   keep their own names and are the same files the popup build writes.
 * - `base: "./"` keeps every URL relative, as in the popup build, so the page
 *   works at a container root and under a CI preview prefix.
 * - `publicDir` is off for the build: the popup build already copies
 *   `public/`. In dev it serves `public/`, so the template loads.
 * - `editor/index.html` loads `./nectar-survey.js` with a `vite-ignore`
 *   module script, so this build leaves the tag as it is (minus the
 *   attribute) rather than bundling the popup into the editor.
 * - In dev, `builtPopup()` serves `nectar-survey.js`, its dialog chunk and the
 *   fonts from a previous `pnpm build`, which the Preview tab needs. Without a build the
 *   preview says the script is missing; everything else works.
 */

const repoRoot = import.meta.dirname;
const distDir = path.resolve(repoRoot, "dist");
const PAGE_SOURCE = "index.html";
const PAGE_OUTPUT = "editor.html";

/** Renames the emitted page from `index.html` to `editor.html`. */
function editorPage(): Plugin {
  return {
    name: "nectar-survey:editor-page",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = bundle[PAGE_SOURCE];
      if (!page || page.type !== "asset") {
        this.error(`the editor build emitted no ${PAGE_SOURCE}`);
      }
      delete bundle[PAGE_SOURCE];
      this.emitFile({
        type: "asset",
        fileName: PAGE_OUTPUT,
        source: page.source,
      });
    },
  };
}

/**
 * Dev only: serves the built popup (the entry, its dialog chunk and the
 * fonts) from `dist/`.
 */
function builtPopup(): Plugin {
  return {
    name: "nectar-survey:built-popup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const wanted =
          url.pathname === "/nectar-survey.js" ||
          /^\/assets\/(dialog-[^/]+\.js|[^/]+\.woff2)$/.test(url.pathname);
        const file = path.join(distDir, path.normalize(url.pathname));
        if (
          !wanted ||
          !file.startsWith(distDir + path.sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          file.endsWith(".js") ? "text/javascript" : "font/woff2",
        );
        createReadStream(file).pipe(response);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  root: path.resolve(repoRoot, "editor"),
  base: "./",
  publicDir: command === "serve" ? path.resolve(repoRoot, "public") : false,
  plugins: [react(), editorPage(), builtPopup()],
  build: {
    outDir: distDir,
    emptyOutDir: false,
    assetsInlineLimit: 0,
    // React, React Aria and the library make one chunk of about 700 kB
    // (about 220 kB gzipped). Fine for a page a few people open now and
    // then; splitting it would only add requests.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      input: { editor: path.resolve(repoRoot, "editor", PAGE_SOURCE) },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/editor-[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));
