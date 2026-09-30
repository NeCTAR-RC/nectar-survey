# Nectar survey popup

## Overview

A web component, `<nectar-survey>`, that invites logged-in users of Nectar services to a user survey. The element is a thin shell around a React dialog built from `@ardc-ui/react` components, rendered inside its shadow root. It ships as a small ES module entry (`nectar-survey.js`, no React) that runs the rules on every page, a lazily loaded dialog chunk (`assets/dialog-<hash>.js`, with React, React Aria, the library and all CSS) that the entry imports only when a survey is due, and a JSON config (`surveys.json`), deployed to a Swift container and loaded by each host service with a module script tag. A config editor page (`editor/`) is built alongside it.

The host integration snippet and the element attributes in `README.md` are the public contract. Changing them means changing every host service, so treat any change as a breaking change and say so.

## Tech stack

TypeScript (strict), React 19, `@ardc-ui/react` (components and Sass tokens) on React Aria, Vite 8 (Rolldown) with `vite-plugin-css-injected-by-js`, Sass, a native custom element with an open shadow root, Vitest (jsdom) for pure logic, Playwright for the rendered dialog, pnpm.

## Layout

- `src/config/`: the pure logic shared by the popup and the editor (`config.ts` types, validation and sanitiser; `dates.ts`; `rules.ts`; `storage.ts`) with their unit tests. No DOM rendering, no React.
- `src/popup/`: the element (`element.ts`: attributes, config fetch, rules, storage, events, mounting and unmounting), the dialog side (`dialog.tsx`: `mountDialog`, the shadow DOM flag, the portal and the React root), the React dialog (`SurveyDialog.tsx`), shadow root styles (`shadowStyles.ts`, `styles.scss`) and fonts (`fonts.ts`, `fonts.scss`). `element.ts` reaches the dialog side only through `await import("./dialog.tsx")`. Only `dialog.tsx` and the modules it imports may import `react`, `react-dom`, `react-aria`, `react-stately` or `@ardc-ui/react`.
- `src/index.ts`: the bundle entry; registers the element.
- `editor/`: the config editor app.
- Imports between groups go through a group's modules (`../config/rules.ts`), never into another group's internals.

## Commands

```bash
pnpm dev              # Demo page with live reload (localhost:5173)
pnpm dev:editor       # Config editor with live reload (its preview needs one pnpm build first)
pnpm build            # tsc -b + both vite builds (popup, then editor) into dist/
pnpm preview          # Serve dist/ (localhost:4173)
pnpm lint             # ESLint + Stylelint + Prettier check
pnpm format           # Prettier write
pnpm test             # Unit tests
pnpm test:coverage    # Coverage report
pnpm test:e2e         # Playwright against the built demo (needs pnpm build first)
```

Always use `pnpm build`, never `vite build` alone: Vite strips types without checking them. The build config and its reasoning live in `vite.config.ts`; keep its comments in step with any change.

## Conventions

- UI: use `@ardc-ui/react` components before writing markup of our own, and use them exactly as they ship. Never add a class that recolours a library component, recreates one of its states, or re-lays-out its internals (no selectors on `.react-aria-*` or the library's own classes). When the library lacks a tone or an option (a danger link, a coloured badge, checkbox columns), choose another library variant that has it, or do without. Our own CSS covers only the page: layout, spacing around components, and our own elements. Every colour, size, radius and font in our Sass comes from `@ardc-ui/react` (`@ardc-ui/react/styles/variables`, `.../typography`, `.../fonts`). No hard-coded colours in `src/`. The demo page's own inline styles are deliberately plain, since it stands in for a host page.
- CSS reaches the shadow root one way: stylesheets imported the normal way (the library components' CSS and `src/popup/styles.scss`) travel inside the dialog chunk, which pushes them onto `window.__nectarSurveyCss` when it loads; `dialog.tsx` adopts them into the shadow root. The only `?inline` import is `src/popup/fonts.scss` (dialog side), which goes into the document head. No CSS file is emitted, and the entry holds no CSS. See `vite.config.ts`.
- The entry must stay free of React: `src/popup/element.ts`, `src/index.ts` and `src/config/` never import React, React Aria or the library, directly or through another module. After any change to them, check the size of `dist/nectar-survey.js` after `pnpm build` (about 7 kB now; `e2e/smoke.spec.ts` fails above 20 kB or when it finds React or CSS in it).
- Keep the element thin: attributes, fetch, rules, mounting and unmounting, storage writes and events. The React component receives the survey, the service and its callbacks, and nothing else.
- React Aria overlays portal into a container inside the shadow root (`UNSAFE_PortalProvider`), so the library CSS applies and the host's does not.
- React Aria's shadow DOM support is switched on in `src/popup/dialog.tsx` through a private path (`react-stately/private/flags/flags`). `react-stately` stays exact-pinned to the version `react-aria-components` resolves; check `ls node_modules/.pnpm | grep react-stately@` after any bump (one entry only).
- Fail quiet: never throw out of the element and render nothing. Faults someone should fix (bad attribute, failed request, invalid config, a dialog chunk that does not load, render error) are one `console.warn` line; normal rule outcomes are one `console.debug` line; never `console.error`, so host page monitoring does not count the popup as a broken page. React render errors go to the root's `onUncaughtError`, never to the page.
- Comments: docblocks on functions, classes and methods are welcome and should be brief. Inline comments only where the reason is not obvious. No section banners, no comments that restate the code.
- Text: Australian English. No em dashes or double hyphens in prose, strings or comments.
- `DESIGN-NOTES.md` lists only choices a designer would review (look, spacing, interaction where the mockup is silent), one line each. The reason behind a technical choice goes in a comment next to the code, a host-facing fact in `README.md`, editor guidance in `docs/editing-surveys.md`. It records no history, no requests and nothing the code already says.
- Tests: pure logic gets Vitest unit tests (`src/**/*.test.ts`); rendered behaviour gets Playwright tests (`e2e/`) on the demo page.
