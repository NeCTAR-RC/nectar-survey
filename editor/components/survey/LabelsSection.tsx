import { Label, TextField } from "@ardc-ui/react";
import {
  DEFAULT_DISMISS_LABEL,
  DEFAULT_LATER_LABEL,
  DEFAULT_START_LABEL,
} from "../../../src/config/config.ts";
import { help, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

const LABEL_FIELDS = [
  ["startLabel", "Start button", DEFAULT_START_LABEL],
  ["laterLabel", "Later button", DEFAULT_LATER_LABEL],
  ["dismissLabel", "Checkbox", DEFAULT_DISMISS_LABEL],
] as const;

/** The popup's two button labels and its checkbox label, each optional. */
export function LabelsSection({ survey, at, fieldId, onChange }: SectionProps) {
  return (
    <FormSection
      title="Button and checkbox labels"
      description="Leave a label empty to use the default."
    >
      <div className="field-grid field-grid-3">
        {LABEL_FIELDS.map(([field, label, placeholder]) => (
          <div id={fieldId(field)} className="field" key={field}>
            <TextField
              value={survey[field]}
              placeholder={placeholder}
              onChange={(value) => onChange({ [field]: value })}
            >
              <Label>{label}</Label>
              {help(`Default: ${placeholder}`, at(field).warnings)}
            </TextField>
          </div>
        ))}
      </div>
    </FormSection>
  );
}
