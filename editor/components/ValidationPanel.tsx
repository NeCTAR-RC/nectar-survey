import { Alert, Button } from "@ardc-ui/react";
import {
  describeProblem,
  type Draft,
  type Issue,
  type JsonProblem,
  type Validation,
} from "../model/index.ts";

interface ValidationPanelProps {
  draft: Draft;
  validation: Validation;
  rawProblem: JsonProblem | null;
  /**
   * Shows the survey an issue is about and takes the reader to its field
   * (the survey as a whole when `field` is undefined).
   */
  onLocate: (surveyIndex: number, field: string | undefined) => void;
}

/**
 * Every error and warning, each with a button that opens the survey it is
 * about, scrolls to the field and moves keyboard focus into it. Issues about
 * the whole file have no button.
 */
export function ValidationPanel({
  draft,
  validation,
  rawProblem,
  onLocate,
}: ValidationPanelProps) {
  if (rawProblem) {
    return (
      <Alert tone="danger">
        The JSON tab has text that is not valid yet, so nothing can be checked.{" "}
        {describeProblem(rawProblem)}
      </Alert>
    );
  }
  const { errors, warnings } = validation;
  if (errors.length === 0 && warnings.length === 0) {
    return (
      <Alert tone="success">
        The popup will read every survey as intended.
      </Alert>
    );
  }
  return (
    <div className="issue-groups">
      <IssueGroup
        heading={`Errors (${errors.length})`}
        intro="The popup skips a survey with an error. Download stays off until every error is fixed."
        issues={errors}
        draft={draft}
        tone="danger"
        onLocate={onLocate}
      />
      <IssueGroup
        heading={`Warnings (${warnings.length})`}
        intro="Worth a look, but they do not stop a download."
        issues={warnings}
        draft={draft}
        tone="warning"
        onLocate={onLocate}
      />
    </div>
  );
}

interface IssueGroupProps {
  heading: string;
  intro: string;
  issues: Issue[];
  draft: Draft;
  tone: "danger" | "warning";
  onLocate: ValidationPanelProps["onLocate"];
}

function IssueGroup({
  heading,
  intro,
  issues,
  draft,
  tone,
  onLocate,
}: IssueGroupProps) {
  if (issues.length === 0) return null;
  return (
    <section className="issue-group" data-tone={tone}>
      <h3>{heading}</h3>
      <p className="group-help">{intro}</p>
      <ul className="issue-list">
        {issues.map(({ surveyIndex, field, message }, index) => (
          <li key={index} className="issue">
            {surveyIndex !== undefined ? (
              <Button
                variant="link"
                size="sm"
                onPress={() => onLocate(surveyIndex, field)}
              >
                {issueLocation(draft, surveyIndex, field)}
              </Button>
            ) : (
              <span className="issue-location">Whole file</span>
            )}
            <span className="issue-message">{message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "nectar-2026, Closes" for an issue's link text; a survey without an id is
 * named by its position, "Survey at position 2, Closes".
 */
function issueLocation(
  draft: Draft,
  surveyIndex: number,
  field: string | undefined,
): string {
  const id = draft.surveys[surveyIndex]?.id;
  const survey = id ? id : `Survey at position ${surveyIndex + 1}`;
  return field === undefined ? survey : `${survey}, ${fieldName(field)}`;
}

const FIELD_NAMES: Record<string, string> = {
  id: "Id",
  enabled: "Enabled",
  opens: "Opens",
  closes: "Closes",
  timezone: "Time zone",
  services: "Services",
  eyebrow: "Eyebrow",
  title: "Title",
  url: "Shared link",
  startLabel: "Start button",
  laterLabel: "Later button",
  dismissLabel: "Checkbox",
};

function fieldName(field: string): string {
  if (field.startsWith("body.")) {
    return `Paragraph ${Number(field.slice("body.".length)) + 1}`;
  }
  if (field.startsWith("urls."))
    return `Link for ${field.slice("urls.".length)}`;
  return FIELD_NAMES[field] ?? field;
}
