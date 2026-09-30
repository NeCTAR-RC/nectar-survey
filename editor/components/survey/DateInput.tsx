import { DateField, FieldError, Label } from "@ardc-ui/react";
import type { Boundary } from "../../../src/config/dates.ts";
import {
  boundaryFieldValue,
  browserTimeHint,
  browserTimeZone,
  minuteText,
  type FieldIssues,
} from "../../model/index.ts";
import { help } from "./fieldHelp.tsx";

interface DateInputProps {
  fieldId: string;
  label: string;
  /** Which end of the window this is; decides the time a date alone means. */
  boundary: Boundary;
  /** "YYYY-MM-DDTHH:mm", a date alone, or any text read from a file. */
  value: string;
  /** The survey's time zone as typed; empty means the popup default. */
  timezone: string;
  issues: FieldIssues;
  onChange: (value: string) => void;
}

/**
 * A date and time field bound to a "YYYY-MM-DDTHH:mm" string. A date alone
 * (from an older file) shows at its implied time and stays as it is until
 * edited; a value that is neither (read from a file) shows as an empty field
 * with the error below it. When the browser counts time in another zone, a
 * muted line under the field (also its description for screen readers) says
 * what the value means there.
 */
export function DateInput({
  fieldId,
  label,
  boundary,
  value,
  timezone,
  issues,
  onChange,
}: DateInputProps) {
  const hint = browserTimeHint(value, boundary, timezone, browserTimeZone());
  const hintId = `${fieldId}-time-hint`;
  return (
    <div id={fieldId} className="field">
      <DateField
        granularity="minute"
        value={boundaryFieldValue(value, boundary)}
        onChange={(next) => onChange(minuteText(next))}
        isInvalid={issues.errors.length > 0}
        isRequired
        aria-describedby={hint === undefined ? undefined : hintId}
      >
        <Label>{label}</Label>
        {help(undefined, issues.warnings)}
        {hint !== undefined && (
          <p id={hintId} className="field-help">
            {hint}
          </p>
        )}
        <FieldError>{issues.errors.join(" ")}</FieldError>
      </DateField>
    </div>
  );
}
