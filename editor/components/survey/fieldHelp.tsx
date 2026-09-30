import { Text } from "@ardc-ui/react";
import type { ReactNode } from "react";
import type { DraftSurvey, FieldIssues } from "../../model/index.ts";

export const NO_ISSUES: FieldIssues = { errors: [], warnings: [] };

/** What every section of a survey's form receives. */
export interface SectionProps {
  survey: DraftSurvey;
  /** The errors and warnings for one field of this survey. */
  at: (field: string) => FieldIssues;
  /** The DOM id of this survey's wrapper, or of one field's wrapper. */
  fieldId: (field?: string) => string;
  /** Every service name the draft knows of, from `serviceNames(draft)`. */
  serviceNames: readonly string[];
  onChange: (patch: Partial<DraftSurvey>) => void;
}

/**
 * A field's help text with its warnings, as the field's description slot so
 * a screen reader reads both with the field. Returns the `Text` element
 * itself (not a component) because the library fields find their
 * description by element type.
 */
export function help(
  hint: ReactNode | undefined,
  warnings: string[],
): ReactNode {
  if (hint === undefined && warnings.length === 0) return null;
  return (
    <Text slot="description">
      {hint}
      {warnings.map((warning) => (
        <span className="field-warning" key={warning}>
          {warning}
        </span>
      ))}
    </Text>
  );
}

/** Replaces one item of a list, leaving the others as they are. */
export function replaceAt<T>(list: T[], position: number, value: T): T[] {
  return list.map((item, i) => (i === position ? value : item));
}
