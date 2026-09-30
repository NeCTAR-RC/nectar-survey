# Editing the surveys

The survey popup on the Nectar services reads one file, `surveys.json`. It says which surveys exist, when they open and close (a date and a time, to the minute), which services show them, and what the popup says. The config editor is a web page for changing that file safely, without writing JSON by hand.

## Where it lives

The editor is `editor.html` at the root of the `nectar-survey` Swift container, next to `surveys.json` and `nectar-survey.js`. Open it in a browser from the container's public address (the same address the services load `nectar-survey.js` from), followed by `/editor.html`.

The editor never uploads anything. It gives you a file to download, and someone with access to the container publishes it.

## Steps

1. **Open the editor.** It loads the live `surveys.json` on its own. If nothing is published yet, it shows four ways to start, each with a short explanation; choose **Start from template**. Once a draft is loaded, the **Load** menu at the top offers the same four ways again, and each button at the top explains itself when you point at it.
2. **Edit.** The **Surveys** list on the left shows every survey in file order, with its position in the file, its id, its title and, in small words under the title, states such as **Disabled**, **Closed** or the number of errors. Select one to show its form on its own: id, on or off, opening and closing date and time, time zone, services, the popup text, the survey links and the button labels. To find a survey, type part of its id or title in the search box, or open **Filters** and choose: **Dates** (**Open now**, **Upcoming**, **Closed**), **Status** (**Enabled**, **Disabled**), **Archive** (**Current**, **Archived**) and **Service**. **Would show now** under **Popup** lists the surveys the popup would show at this moment: open now, enabled and not archived. Filters combine, and choosing a chosen one again clears it; **Clear filters** goes back to the start, which lists current surveys only. The survey you are editing stays in the list even when it no longer matches, at the end under "Selected, outside the filter". **Add survey**, **Duplicate**, **Move up**, **Move down** and **Remove** work on whole surveys. When a survey is over, press **Archive** on its form: it stays in the file as a record, and the popup never shows it again, whatever its dates or its Enabled switch say. A closed survey that is not archived yet shows a note suggesting it. Choose the **Archived** filter to list archived surveys, press **Unarchive** on one to bring it back, or **Remove archived surveys** under the list to drop them all. Nothing is archived automatically. You can also edit the file as text in the **JSON** tab; the form and the text follow each other.
3. **Check.** The **Problems** tab counts errors and warnings in its title and lists them. Select one to show its survey and jump to its field.
   - An **error** means the popup would skip the survey or misread it. The download stays off until every error is fixed, and the reason is shown under the buttons at the top.
   - A **warning** is worth a look but does not stop you, for example an enabled survey without a link, a survey that has already closed, or a title without `{service}`.
4. **Preview.** In the **Preview** tab, choose a service and, if needed, a date and time, then press **Show popup**. This is the real popup, showing your draft. While the survey links are not ready, keep "Treat every survey as enabled" on: the preview then uses a sample link. The popup remembers what you choose in it, as it would for a user; press **Reset saved state** to see it again.
5. **Compare.** The **Changes** tab lists what publishing would change: new and removed surveys, and every changed field with its live and draft value.
6. **Download.** Press **Download surveys.json** and send the file to Hakkim.

Your work is saved in this browser as you type. If you close the tab or reload, the draft comes back (the top of the page then says "Unsaved draft restored"), and the browser asks before you leave with changes that were not downloaded. Loading another file while there are such changes asks first too.

### Text in the popup

- `{service}` in the title and body is replaced with the service name, for example "Tell us about your {service} experience".
- Body paragraphs may use `<strong>`, `<em>` and `<a href="https://...">` links. Anything else shows as text, and the editor warns about it. Under each paragraph, the form shows exactly what the popup will show.
- The title, eyebrow and labels are plain text.
- Leave a button or checkbox label empty to use the default wording.

### The id

The id (for example `nectar-2026`) is how each browser remembers that a person started or dismissed a survey. Keep it the same for the life of a survey. A new id makes it a new survey, so everyone is asked again; the editor warns if you change the id of a live survey.

### What the config cannot change

These rules are built into the popup and are the same for every survey:

- A person sees a survey at most once per calendar day, counted in the survey's time zone. "Not right now" hides it until the next day.
- Starting the survey, or ticking "Don't show me this again", stops that survey for good in that browser.
- Only logged-in users see it, because each service adds the popup only to its logged-in pages.
- The popup checks the dates when a page loads, not while it is open. A survey that opens while someone already has a page open appears on their next page load, and a popup that is already open when its survey closes stays open until they close it.
- When several surveys apply to a service at the same time, the first one in the list is shown and the others wait.

Changing any of these is a code change to the popup, not a config edit.

## Publishing

Hakkim uploads the downloaded file from the folder it is in:

```bash
swift upload nectar-survey surveys.json --header "Content-Type: application/json" --header "Cache-Control: public, max-age=0, must-revalidate"
```

The popup reads the file again on every page load, so the change reaches users on their next page load on each service. No release or restart is needed.

`surveys.json` exists only in the container. It is never part of a code release: the repository ships `surveys.example.json` (the template) instead, so deploying new code never overwrites the published surveys. Until a file is published, the popup finds no config and shows nothing.

## Rolling back

Once per container, turn on version history, so every upload keeps the version it replaces in a separate, private container:

```bash
swift post nectar-survey-history
swift post nectar-survey --header "X-History-Location: nectar-survey-history"
```

To go back to an earlier version, list the saved versions of `surveys.json`, download the one you want, and upload it again with the command above:

```bash
swift list nectar-survey-history --prefix 00csurveys.json/
swift download nectar-survey-history "00csurveys.json/<timestamp>" --output surveys.json
```

Swift names each saved version after the file: the length of its name in hexadecimal (`00c` for `surveys.json`), the name, a slash and the time it was replaced. History also keeps old versions of the code files that each release replaces; the prefix above lists `surveys.json` only.

## Running it locally (developers)

- `pnpm build` writes the editor to `dist/editor.html` with `dist/assets/editor-*.js` and `.css`, next to the popup build. `pnpm preview` then serves it at `http://localhost:4173/editor.html`, with everything working, including the preview. The preview server has no `surveys.json`, so the editor starts with "nothing published yet".
- `pnpm dev:editor` serves the editor from source with live reload at `http://localhost:5173/`. The template comes from `public/`. The Preview tab needs `nectar-survey.js`, which the dev server takes from `dist/`, so run `pnpm build` once first; without it the preview says the script did not load and the rest of the editor still works.
- The editor's shared rules come from `src/config/` (the same code the popup runs); its own logic is in `editor/model/` (one module per concern) and `editor/state.ts`, with unit tests beside them, and `e2e/editor.spec.ts` covers the page.
