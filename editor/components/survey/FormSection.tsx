import { InfoButton, Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { useId, type ReactNode } from "react";

interface FormSectionProps {
  title: string;
  /** One line under the heading saying what the section is for. */
  description: ReactNode;
  /** A longer explanation, behind an info button beside the heading. */
  info?: string;
  children: ReactNode;
}

/**
 * One titled group of a survey's form: a fieldset whose legend holds the
 * section heading and a short description under it. The fieldset is named by
 * the title alone and described by the description, so the info button's
 * label stays out of its name.
 */
export function FormSection({
  title,
  description,
  info,
  children,
}: FormSectionProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <fieldset
      className="form-section"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <legend>
        <span className="form-section-heading">
          <span id={titleId}>{title}</span>
          {info !== undefined && (
            <TooltipTrigger>
              <InfoButton aria-label={`About ${title.toLowerCase()}`} />
              <Tooltip>{info}</Tooltip>
            </TooltipTrigger>
          )}
        </span>
        <span id={descriptionId} className="form-section-description">
          {description}
        </span>
      </legend>
      {children}
    </fieldset>
  );
}
