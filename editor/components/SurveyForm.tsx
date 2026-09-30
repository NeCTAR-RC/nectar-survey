import { Alert, Badge, Button } from "@ardc-ui/react";
import {
  fieldDomId,
  surveyName,
  type DraftSurvey,
  type FieldIssues,
} from "../model/index.ts";
import { BasicsSection } from "./survey/BasicsSection.tsx";
import { DatesSection } from "./survey/DatesSection.tsx";
import { NO_ISSUES, type SectionProps } from "./survey/fieldHelp.tsx";
import { LabelsSection } from "./survey/LabelsSection.tsx";
import { LinksSection } from "./survey/LinksSection.tsx";
import { PopupTextSection } from "./survey/PopupTextSection.tsx";
import { ServicesSection } from "./survey/ServicesSection.tsx";

interface SurveyFormProps {
  survey: DraftSurvey;
  index: number;
  count: number;
  issues: Map<string, FieldIssues>;
  /** True when the popup reads the survey as already closed. */
  isClosed: boolean;
  /** Every service name the draft knows of, from `serviceNames(draft)`. */
  serviceNames: readonly string[];
  onChange: (patch: Partial<DraftSurvey>) => void;
  onMove: (offset: -1 | 1) => void;
  onDuplicate: () => void;
  /** Archives (true) or unarchives (false) the survey. */
  onArchive: (archive: boolean) => void;
  onRemove: () => void;
}

/**
 * The card for one survey: a header with its id, state and actions,
 * then every key of the config reference as a labelled field in titled
 * sections. Each field shows its errors (below it) and warnings (with its
 * help text) and sits in an element whose id the Problems tab links to.
 */
export function SurveyForm({
  survey,
  index,
  count,
  issues,
  isClosed,
  serviceNames,
  onChange,
  onMove,
  onDuplicate,
  onArchive,
  onRemove,
}: SurveyFormProps) {
  const name = surveyName(survey);
  const sectionProps: SectionProps = {
    survey,
    at: (field) => issues.get(field) ?? NO_ISSUES,
    fieldId: (field) => fieldDomId(index, field),
    serviceNames,
    onChange,
  };
  const surveyId = fieldDomId(index);
  const headingId = `${surveyId}-heading`;
  const general = sectionProps.at("");

  return (
    <section
      id={surveyId}
      className="survey"
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <header className="survey-header">
        <div className="survey-title">
          <h2 id={headingId}>{survey.id !== "" ? survey.id : "No id yet"}</h2>
          <Badge>{survey.enabled ? "Enabled" : "Disabled"}</Badge>
          {isClosed && <Badge>Closed</Badge>}
        </div>
        <div
          className="survey-actions"
          role="group"
          aria-label={`Actions for ${name}`}
        >
          <Button
            variant="link"
            size="sm"
            isDisabled={index === 0}
            onPress={() => onMove(-1)}
            aria-label={`Move ${name} up`}
          >
            Move up
          </Button>
          <Button
            variant="link"
            size="sm"
            isDisabled={index === count - 1}
            onPress={() => onMove(1)}
            aria-label={`Move ${name} down`}
          >
            Move down
          </Button>
          <Button
            variant="link"
            size="sm"
            onPress={onDuplicate}
            aria-label={`Duplicate ${name}`}
          >
            Duplicate
          </Button>
          <Button
            variant="link"
            size="sm"
            onPress={() => onArchive(!survey.archived)}
            aria-label={`${survey.archived ? "Unarchive" : "Archive"} ${name}`}
          >
            {survey.archived ? "Unarchive" : "Archive"}
          </Button>
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onPress={onRemove}
            aria-label={`Remove ${name}`}
          >
            Remove
          </Button>
        </div>
      </header>

      {isClosed && !survey.archived && (
        <Alert tone="info">
          This survey has closed. Archive it to keep it in the file as a record
          and out of the way.{" "}
          <Button
            variant="link"
            size="sm"
            onPress={() => onArchive(true)}
            aria-label={`Archive ${name}`}
          >
            Archive
          </Button>
        </Alert>
      )}

      {general.errors.length + general.warnings.length > 0 && (
        <Alert tone={general.errors.length > 0 ? "danger" : "warning"}>
          <ul className="plain-list">
            {[...general.errors, ...general.warnings].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <BasicsSection {...sectionProps} />
      <DatesSection {...sectionProps} />
      <ServicesSection {...sectionProps} />
      <PopupTextSection {...sectionProps} />
      <LinksSection {...sectionProps} />
      <LabelsSection {...sectionProps} />
    </section>
  );
}
