/**
 * Entry point of the `nectar-survey.js` bundle. Loading the script registers
 * the `<nectar-survey>` custom element; hosts only place the tag.
 */

import { NectarSurvey } from "./popup/element.ts";

const ELEMENT_NAME = "nectar-survey";

// A host may load the script twice (for example once per template include);
// defining the same name again would throw, so only the first load registers.
if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, NectarSurvey);
}
