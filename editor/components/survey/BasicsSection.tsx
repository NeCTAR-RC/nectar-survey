import { FieldError, Label, Switch, TextField } from "@ardc-ui/react";
import { help, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/** The survey's id and its on or off switch. */
export function BasicsSection({ survey, at, fieldId, onChange }: SectionProps) {
  const enabledHelpId = `${fieldId("enabled")}-help`;
  return (
    <FormSection
      title="Basics"
      description="How browsers recognise this survey, and whether users see it."
    >
      <div id={fieldId("id")} className="field">
        <TextField
          value={survey.id}
          onChange={(value) => onChange({ id: value })}
          isInvalid={at("id").errors.length > 0}
          isRequired
        >
          <Label>Id</Label>
          {help(
            "Stays the same for the life of a survey: each browser remembers its choices under this id.",
            at("id").warnings,
          )}
          <FieldError>{at("id").errors.join(" ")}</FieldError>
        </TextField>
      </div>
      <div id={fieldId("enabled")} className="field">
        <Switch
          isSelected={survey.enabled}
          onChange={(enabled) => onChange({ enabled })}
          aria-describedby={enabledHelpId}
        >
          Enabled
        </Switch>
        <p id={enabledHelpId} className="field-help">
          Shows this survey to users. Keep it off until the survey links are
          ready.
        </p>
      </div>
    </FormSection>
  );
}
