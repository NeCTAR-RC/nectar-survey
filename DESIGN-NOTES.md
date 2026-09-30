# Design notes

The popup follows the "Nectar Survey Popup Options" mockup, modal variant 2a, built from `@ardc-ui/react` components used as they ship. This file lists only the choices made where the mockup is silent, for designers to review. The reason behind a technical choice lives in a comment next to the code, host-facing facts in `README.md`, editor guidance in `docs/editing-surveys.md`.

## Popup

- Eyebrow: `body-12-bold`, Purple-500 capitals with 0.05em letter spacing (the library's capitalised-label treatment), 4px above the title. It is left out of the dialog's accessible name and read as part of its description.
- Actions: "Start survey" is the primary navigation-tone link with the external-link icon; "Not right now" is a link-style button without a chevron; "Don't show me this again" sits on its own line 16px below them, in the actions area so it never scrolls away.
- Body links use the `body-16-link` style: Purple-500 bold, underlined, Purple-700 on hover.
- Focus lands on "Start survey" when the popup opens. Escape, the close button and a click outside all count as "Not right now".
- The overlay sits above host chrome such as Bootstrap 3 fixed navbars and modals.

## Editor

- Preview trigger: the preview re-mounts the popup on "Show popup" and when a preview setting changes, not on every edit, because the modal takes focus away from the form.
- Frame: the library's white tab panel is the side frame, with no card around it; the start screen is four white `Card`s on the grey page; the header is sticky with a status strip under it. Three columns from 1280px, two from 1024px, one below.
- Survey list rows are our own buttons: bare on the grey page, Grey-100 under the pointer, the selected row white with a 3px Purple-500 rule on its leading edge. Three tight lines: position and id, title, states as muted words joined by a middle dot, error counts in Red-700 semibold.
- Badges are the library's grey chip as shipped; the words carry the state.
- Heading scale: page title h3 style, "Surveys" h4, the shown survey's id h4, section legends h5. Sections 32px apart, fields 20px, columns 16px.
- Remove actions use the small secondary button in its danger tone; add actions are link buttons with the plus icon; Copy JSON shows the copied glyph for two seconds.
- Opens and Closes share a row, the time zone takes the next row at half width; a muted line under each shows the moment in the reader's own zone when it differs from the survey's.
- Toasts: success and info leave after 6 seconds, warnings and errors stay; at most three at once.
- Code and raw JSON use the system monospace stack; the library has no monospace token.
