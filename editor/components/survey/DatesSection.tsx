import {
  FieldError,
  Label,
  Select,
  SelectItem,
  Text,
  TextField,
} from "@ardc-ui/react";
import { useState } from "react";
import { DEFAULT_TIMEZONE } from "../../../src/config/config.ts";
import { TIMEZONE_OPTIONS } from "../../model/index.ts";
import { DateInput } from "./DateInput.tsx";
import { help, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

const OTHER_TIMEZONE = "other";

/**
 * Opens, Closes and the time zone they are counted in. "Other time zone"
 * shows a text field for any IANA name. Changing the zone never rewrites
 * Opens or Closes: they stay wall-clock times as typed.
 */
export function DatesSection({ survey, at, fieldId, onChange }: SectionProps) {
  const [otherTimezoneChosen, setOtherTimezoneChosen] = useState(false);
  const timezoneIsOther =
    otherTimezoneChosen ||
    (survey.timezone !== "" &&
      !TIMEZONE_OPTIONS.some((option) => option.id === survey.timezone));

  return (
    <FormSection
      title="Dates"
      description="From the first minute to the last, in the survey's time zone."
    >
      <div className="field-grid field-grid-2">
        <DateInput
          fieldId={fieldId("opens")}
          label="Opens"
          boundary="opens"
          value={survey.opens}
          timezone={survey.timezone}
          issues={at("opens")}
          onChange={(opens) => onChange({ opens })}
        />
        <DateInput
          fieldId={fieldId("closes")}
          label="Closes"
          boundary="closes"
          value={survey.closes}
          timezone={survey.timezone}
          issues={at("closes")}
          onChange={(closes) => onChange({ closes })}
        />
        <div id={fieldId("timezone")} className="field">
          <Select
            value={
              timezoneIsOther
                ? OTHER_TIMEZONE
                : survey.timezone || DEFAULT_TIMEZONE
            }
            onChange={(key) => {
              if (key === OTHER_TIMEZONE) {
                setOtherTimezoneChosen(true);
              } else if (typeof key === "string") {
                setOtherTimezoneChosen(false);
                onChange({ timezone: key });
              }
            }}
            isInvalid={!timezoneIsOther && at("timezone").errors.length > 0}
          >
            <Label>Time zone</Label>
            <Text slot="description">
              Changing the zone keeps the times as typed and changes what they
              mean.
            </Text>
            {TIMEZONE_OPTIONS.map((option) => (
              <SelectItem key={option.id} id={option.id}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem id={OTHER_TIMEZONE}>Other time zone</SelectItem>
          </Select>
          {timezoneIsOther && (
            <TextField
              className="field-follow-up"
              value={survey.timezone}
              onChange={(timezone) => onChange({ timezone })}
              isInvalid={at("timezone").errors.length > 0}
            >
              <Label>Other time zone (IANA name)</Label>
              {help(
                "For example Pacific/Auckland. Leave empty for Australia/Melbourne.",
                at("timezone").warnings,
              )}
              <FieldError>{at("timezone").errors.join(" ")}</FieldError>
            </TextField>
          )}
        </div>
      </div>
    </FormSection>
  );
}
