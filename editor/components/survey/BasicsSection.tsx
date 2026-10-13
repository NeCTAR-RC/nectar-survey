import {
  FieldError,
  Label,
  TextField,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@ardc-ui/react";
import { useEffect, useRef } from "react";
import { isSurveyStatus, SURVEY_STATUSES } from "../../../src/config/config.ts";
import { chooseStatus, STATUS_TEXT } from "../../model/index.ts";
import { help, helpParagraph, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * The survey's id and its status. The status is a toggle button group with
 * one button per status. The group has no label, description or error slot
 * of its own, so this section draws them and ties them to the group with
 * `aria-labelledby` and `aria-describedby`. Nothing is pressed while a file
 * in the older format has no status yet; once one is chosen, the group never
 * goes empty again.
 */
export function BasicsSection({ survey, at, fieldId, onChange }: SectionProps) {
  const status = at("status");
  const statusId = fieldId("status");
  const labelId = `${statusId}-label`;
  const helpId = `${statusId}-help`;
  const errorId = `${statusId}-error`;
  const isInvalid = status.errors.length > 0;
  const groupRef = useRef<HTMLDivElement>(null);

  // React Aria filters aria-invalid out of the group's DOM props, and the
  // group has no invalid state of its own, so it is set on the element.
  useEffect(() => {
    if (isInvalid) groupRef.current?.setAttribute("aria-invalid", "true");
    else groupRef.current?.removeAttribute("aria-invalid");
  }, [isInvalid]);

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
      <div id={statusId} className="field">
        <div className="field-header">
          <span id={labelId} className="field-label">
            Status
          </span>
          {helpParagraph(
            helpId,
            survey.status === ""
              ? "Whether users see this survey."
              : STATUS_TEXT[survey.status].help,
            status.warnings,
          )}
        </div>
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={survey.status === "" ? [] : [survey.status]}
          disallowEmptySelection={survey.status !== ""}
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            if (isSurveyStatus(key)) onChange(chooseStatus(survey, key));
          }}
          aria-labelledby={labelId}
          aria-describedby={isInvalid ? `${helpId} ${errorId}` : helpId}
          ref={groupRef}
        >
          {SURVEY_STATUSES.map((value) => (
            <ToggleButtonGroupItem key={value} id={value}>
              {STATUS_TEXT[value].label}
            </ToggleButtonGroupItem>
          ))}
        </ToggleButtonGroup>
        {isInvalid && (
          <p id={errorId} className="field-error">
            {status.errors.join(" ")}
          </p>
        )}
      </div>
    </FormSection>
  );
}
