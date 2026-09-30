# Nectar survey popup

A small web component that invites logged-in users of Nectar services to take part in a user survey. One script and one JSON config serve every service (the Nectar Dashboard, the ARDC Jupyter Notebook Service, the ARDC BinderHub Service and the ARDC Virtual Desktop Service). The config decides which surveys exist, when each one opens and closes (to the minute), which services they apply to, the text and the links. The rules are built into the popup and are the same for every survey: it shows at most once a day while a survey is open, never again after the user starts the survey or ticks "Don't show me this again", and it renders nothing if anything goes wrong. There is no backend: the user's choices are kept in the browser's `localStorage`.

## Host integration

Add this to the base page template of the service, the one every logged-in page extends, inside the block that renders only for logged-in users (Django `{% if request.user.is_authenticated %}`, JupyterHub `{% if user %}`). Every page rather than the home page alone: a user who lands on another page from a bookmark still gets the invitation that day, and the once-a-day rule keeps it to one showing however many pages they open. On a server-rendered app such as the Nectar Dashboard every navigation is a page load, so the popup checks again on each page.

```html
<script
  type="module"
  src="https://survey.rc.nectar.org.au/nectar-survey.js"
></script>
<nectar-survey service="Nectar Dashboard"></nectar-survey>
```

This snippet is the public contract of the project. Changing it means changing every host service. The script must be loaded as a module (`type="module"`): it is an ES module, which a classic script tag cannot run, and it loads the dialog on demand from a file at an address relative to its own. A module script waits for the page to be parsed, like `defer`, so the popup behaves the same wherever the tag sits. Use the address exactly as shown, without a query string: the dialog file imports the entry by its plain address, so a `?v=` on the tag would make the browser hold a second copy.

The popup has no login check of its own. "Logged-in users only" holds because the host renders the element only for logged-in users.

### Host page checks

Two things on the host page can get in the way. Check them once when adding the snippet.

- **Root font size.** The popup and the library components inside it are sized in `rem`, which follows the page's root font size even inside a shadow root. A page whose root is 16px shows the popup at its designed size; a page that sets the root smaller (Bootstrap 3 sets 10px) shows it small. Keep the root at 16px, or restore it on `html` before the snippet runs.
- **Content Security Policy.** A page that sends one needs to allow the script and its dialog file (`script-src https://survey.rc.nectar.org.au`), the config fetch (`connect-src https://survey.rc.nectar.org.au`), the font files (`font-src https://survey.rc.nectar.org.au`) and the one `<style>` element the popup adds to the page head for its font faces (`style-src` with `'unsafe-inline'` or a nonce the host provides). A page without a policy needs nothing.

### Element attributes

- **`service`** (required). The display name of the host service, for example `Nectar Dashboard`. The popup uses it in three places: it fills the `{service}` placeholder in the survey text, it decides whether a survey applies to this service (the `services` list in the config), and it picks the per-service link (the `urls` map). Without it the element logs one warning and shows nothing.
- **`config-url`** (optional). Where to fetch the config from. When it is not set, the popup uses the address the script was loaded from and swaps the file name: a script at `https://example.org/nectar-survey.js` fetches `https://example.org/surveys.json`. Both files live in the same Swift container, so host services never set this. The demo page sets it to use its own demo config. A relative value is resolved against the page, like any link on the page.
- **`now`** (optional, demo and tests only). A date or date and time in ISO format, for example `2026-10-20T10:00`, that the popup treats as the current time instead of the real one. Changing it makes the element check the rules again. An invalid value shows nothing. Never set it on a host service.

The element fetches the config each time it is added to the page (with `cache: "no-cache"`: the browser keeps a copy but checks it with the server every time, so a changed file is used at once) and shows at most one survey. It checks the rules once, at that moment, and does not watch the clock: a survey that opens while a page is already open appears on the next page load, and a popup already open when its survey closes stays open. The element never throws into the host page. A fault someone should fix (a missing attribute, a failed request, invalid JSON, an invalid survey entry, a dialog file that does not load, a render error) is one `console.warn` line and nothing on screen. A normal outcome of the rules (no survey open today, already shown, dismissed) is one `console.debug` line, hidden unless the console's verbose level is on. It never logs at error level, so host page monitoring does not count the popup as a broken page.

### Events

The element dispatches these events on itself. They bubble and cross the shadow root, so a host can listen on `document`. Each carries `detail: { surveyId }`.

- **`nectar-survey:open`**: the popup opened.
- **`nectar-survey:start`**: the user chose "Start survey".
- **`nectar-survey:later`**: the user closed the popup for today ("Not right now", the close button, Escape or a click outside the panel).
- **`nectar-survey:dismiss`**: the user closed the popup with "Don't show me this again" ticked.

### Script API

For the demo page and tests; host services do not need these.

- `NectarSurvey.resetState()` (static, on `customElements.get("nectar-survey")`): forgets every choice stored in this browser.
- `element.refresh()`: closes an open popup without recording a choice and checks again. Returns a promise that resolves when the check has finished.
- `element.settled`: a promise that resolves when the latest check has finished, whether or not the popup opened.

## Performance

The popup is split in two so that a page with no survey to show costs almost nothing. Sizes are from the current build.

- **Every page:** the entry script `nectar-survey.js` (about 7 kB, about 3 kB gzipped) checks the rules. It holds no React and no styles. The browser asks the server once for the script and once for `surveys.json`, and while neither has changed each answer is a short "not modified" with no body. When no survey is due, that is all: no React is downloaded or run.
- **When a survey is due:** the entry loads the dialog file `assets/dialog-<hash>.js` (about 358 kB, about 106 kB gzipped), which holds React, React Aria, the ARDC UI components and the popup's styles. The browser keeps it for a year, so it is downloaded once, not once a day.
- **Caching:** files at the container root (`nectar-survey.js`, `surveys.json`, the pages) are checked with the server on every page load, so a release or a config change reaches users at once. Files under `assets/` have a hash of their content in their name and never change, so they are cached for a year without checks. A release that changes the dialog gives it a new name, and the new entry points to that name, so a stale dialog is never served.

## Config reference

The live config is the file `surveys.json` in the Swift container, in the same folder as `nectar-survey.js`. It is edited with the config editor (`editor.html` in the same container; see [docs/editing-surveys.md](docs/editing-surveys.md)) and uploaded by hand. CI never builds or deploys it, so a code release cannot overwrite it. The repository ships `public/surveys.example.json` as the template.

The file holds a `surveys` list. The popup goes through the list in order and shows the first survey that applies, at most one per page load. Unknown keys are ignored. A survey is skipped when `id`, `opens`, `closes`, `title` or `services` is missing, when it has no usable link for the service, or when `enabled` is anything other than `true`.

Three text fields, `eyebrow`, `title` and `body`, can hold the placeholder `{service}`. The popup replaces it with the host's `service` attribute, so one survey entry reads "Tell us about your Nectar Dashboard experience" on the dashboard and "Tell us about your ARDC Jupyter Notebook Service experience" on Jupyter.

- **`id`**: a stable identifier. The browser stores the user's choices under it, so change it only for a new survey.
- **`enabled`**: `true` to show the survey. Keep `false` until the survey links are ready.
- **`archived`**: optional. `true` keeps the survey in the file for the record only: the popup never shows it, whatever the other fields say, and the editor lists it under its Archived filter. Set and cleared with the editor's Archive and Unarchive buttons.
- **`opens`**: the first minute of the survey, `YYYY-MM-DDTHH:mm` (24-hour clock), in `timezone`, for example `2026-10-13T09:00`. A date alone means that day from 00:00.
- **`closes`**: the last minute of the survey, `YYYY-MM-DDTHH:mm` (24-hour clock), in `timezone`. A date alone means that day up to 23:59. Both minutes are included, and `closes` may be the same minute as `opens`, but not earlier.
- **`timezone`**: the IANA time zone the two values are read in, for example `Australia/Melbourne`. Default `Australia/Melbourne`. The popup converts the user's current time into this zone before comparing, so it works the same wherever the user is.
- **`services`**: the list of service names this survey applies to, or the string `"all"`. Names must match the hosts' `service` attributes exactly. Any name works as long as it matches a host's `service` attribute, and the editor offers every name it finds in the file beside the four known services.
- **`eyebrow`**: optional short plain-text label shown above the title, for example "Nectar research cloud survey".
- **`title`**: the popup title, plain text.
- **`body`**: the paragraphs under the title, as a list of strings (or one string for one paragraph). Bold (`<strong>`), italics (`<em>`) and links (`<a href="https://...">`) are allowed; any other markup is shown as literal text.
- **`url`**: the survey link shared by every service.
- **`urls`**: survey links per service name, for example `{ "Nectar Dashboard": "https://..." }`. When a service has a usable entry here, it is used instead of `url`.
- **`startLabel`**: the text of the button that opens the survey in a new tab. Default "Start survey".
- **`laterLabel`**: the text of the button that closes the popup until tomorrow. Default "Not right now".
- **`dismissLabel`**: the text of the checkbox that stops the popup for good. Default "Don't show me this again".

## Local development

Requires Node 24 and pnpm. The `@ardc-ui` packages come from the ARDC Verdaccio registry set in `.npmrc`.

```bash
pnpm install            # Install dependencies and the git hooks
pnpm dev                # Demo page with live reload (http://localhost:5173)
pnpm dev:editor         # Config editor with live reload (needs one pnpm build first for its preview)
pnpm build              # Type check and build the popup and the editor into dist/
pnpm preview            # Serve dist/ (http://localhost:4173)
pnpm lint               # ESLint, Stylelint and Prettier check
pnpm format             # Format with Prettier
pnpm test               # Unit tests (Vitest)
pnpm test:watch         # Unit tests in watch mode
pnpm test:coverage      # Unit test coverage report
pnpm test:e2e:install   # Install the Playwright browser (once)
pnpm test:e2e           # Browser tests against the built demo (run pnpm build first)
pnpm test:e2e:ui        # Browser tests in the Playwright UI
```

The demo page (`index.html`) is a plain stand-in for a host service. It reads `public/surveys.demo.json`, a copy of `surveys.json` with the survey enabled and a placeholder link (`https://example.com/nectar-survey`), open from 13 October to 14 November 2026.

- The demo pretends it is 20 October 2026, 10:00, so the popup shows on the first visit whatever the real date is.
- "Pretend the date is" sets the element's `now` attribute; clearing it uses the real date and time.
- `?now=<ISO date or date and time>` in the address sets `now` before the element first checks, for example `/?now=2026-11-15T10:00` (after the survey closes). An empty `?now=` uses the real date and time.
- "Reset saved state" forgets every stored choice and checks again.

Under `pnpm dev` the demo loads the source as a module; the built `dist/index.html` loads `./nectar-survey.js` exactly as a host does. The Playwright tests (`e2e/`) drive the built demo.

### Trying it by hand

1. Build and serve the result: `pnpm build && pnpm preview`.
2. Editor: open http://localhost:4173/editor.html. The start screen reports that there is no `surveys.json` (there is none in a local build), so start from the template or use "Open file" on `public/surveys.example.json`. Edit, watch the Problems tab, preview the popup for each service, then download.
3. Demo page: open http://localhost:4173/. It shows the demo survey straight away because it pretends the date is 20 October 2026. Try each way of closing it, then "Reset saved state" to see it again. Add `?now=2026-11-15T10:00` to see the closed state. To try a config you downloaded, copy it into `dist/` and set the element's `config-url` to it in the browser devtools.
4. A real host: add the host snippet to a development copy of the service, with `src="http://localhost:4173/nectar-survey.js"` and `config-url="http://localhost:4173/surveys.demo.json"`. The browser runs on the same machine as the preview server, so it can reach it. Add `now="2026-10-20T10:00"` to the element while the survey dates are in the future.

## Build output

`pnpm build` writes:

- `dist/nectar-survey.js`: the entry, a small ES module that checks the rules on every page.
- `dist/assets/dialog-*.js`: the dialog with React, the library components and all the styles, loaded by the entry only when a survey is due.
- `dist/surveys.example.json`: the config template, copied from `public/`.
- `dist/surveys.demo.json`: the demo page's config, copied from `public/`.
- `dist/index.html`: the demo page, loading `./nectar-survey.js`.
- `dist/editor.html` with `dist/assets/editor-*.js` and `.css`: the config editor.
- `dist/assets/*.woff2`: fonts, with hashed file names.

There is no `dist/surveys.json`: the live config belongs to the container, not to the build.

## Config editor

`editor.html` is a React app on the same library components. It loads the live `surveys.json`, edits it as a form or as raw JSON, validates it with the popup's own rules (`src/config/`), previews the real popup and downloads the result for upload. Its pure core lives in `editor/model/` (one module per concern) with `editor/state.ts` as the reducer; `docs/editing-surveys.md` is the guide for the people who edit surveys.

## Deploy

The shared `nodejs-*` Jenkins jobs lint, test, build and upload `dist/` to the `nectar-survey` Swift container. Files at the container root (`nectar-survey.js`, `editor.html`, `index.html`, the two JSON files) are served with `max-age=0, must-revalidate`, so browsers check for a new version on every visit. Files under `assets/` have hashed names and are served immutable for a year; they are uploaded before the root files, so a new `nectar-survey.js` never points to a dialog file that is not there yet. Files under `assets/` that a release no longer uploads are deleted 90 days later; a tab left open longer than that across a release fails its next showing quietly and picks up the new entry on its next page load. The demo page on the container doubles as a live demo. `surveys.json` is uploaded separately, by hand, as `docs/editing-surveys.md` describes.
