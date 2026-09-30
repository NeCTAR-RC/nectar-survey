import { Button, FieldError, Label, TextArea, TextField } from "@ardc-ui/react";
import {
  effectiveServices,
  KNOWN_SERVICES,
  renderParagraph,
} from "../../model/index.ts";
import { help, replaceAt, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * What the popup says: eyebrow, title and body paragraphs. The title and
 * each paragraph show beneath them exactly as the popup will, for the first
 * service the survey is shown on.
 */
export function PopupTextSection({
  survey,
  at,
  fieldId,
  serviceNames,
  onChange,
}: SectionProps) {
  const sampleService =
    effectiveServices(survey, serviceNames)[0] ?? KNOWN_SERVICES[0];
  const shownOn = `As shown on ${sampleService}`;

  return (
    <FormSection
      title="Popup text"
      description="What people read in the popup. {service} becomes the name of the service they are on."
    >
      <div id={fieldId("eyebrow")} className="field">
        <TextField
          value={survey.eyebrow}
          onChange={(eyebrow) => onChange({ eyebrow })}
        >
          <Label>Eyebrow</Label>
          {help("Short label above the title.", at("eyebrow").warnings)}
        </TextField>
      </div>
      <div id={fieldId("title")} className="field">
        <TextField
          value={survey.title}
          onChange={(title) => onChange({ title })}
          isInvalid={at("title").errors.length > 0}
          isRequired
        >
          <Label>Title</Label>
          {help("Plain text.", at("title").warnings)}
          <FieldError>{at("title").errors.join(" ")}</FieldError>
        </TextField>
        {survey.title !== "" && (
          <div className="rendered">
            <span className="rendered-label">{shownOn}</span>
            <p>{survey.title.replaceAll("{service}", sampleService)}</p>
          </div>
        )}
      </div>

      <div className="paragraphs">
        <p className="paragraphs-hint">
          Paragraphs may use <code>&lt;strong&gt;</code>,{" "}
          <code>&lt;em&gt;</code> and{" "}
          <code>&lt;a href=&quot;https://...&quot;&gt;</code> links. Other
          markup shows as text.
        </p>
        {survey.body.map((paragraph, paragraphIndex) => {
          const field = `body.${paragraphIndex}`;
          const labelId = `${fieldId(field)}-label`;
          const number = paragraphIndex + 1;
          return (
            <div id={fieldId(field)} className="paragraph" key={paragraphIndex}>
              <div className="paragraph-header">
                <span id={labelId} className="paragraph-title">
                  Paragraph {number}
                </span>
                <Button
                  variant="secondary"
                  tone="danger"
                  size="sm"
                  onPress={() =>
                    onChange({
                      body: survey.body.filter((_, i) => i !== paragraphIndex),
                    })
                  }
                  aria-label={`Remove paragraph ${number}`}
                >
                  Remove
                </Button>
              </div>
              <TextArea
                aria-labelledby={labelId}
                value={paragraph}
                onChange={(value) =>
                  onChange({
                    body: replaceAt(survey.body, paragraphIndex, value),
                  })
                }
              >
                {help(undefined, at(field).warnings)}
              </TextArea>
              {paragraph.trim() !== "" && (
                <div className="rendered">
                  <span className="rendered-label">{shownOn}</span>
                  <p
                    // renderParagraph returns the sanitiser's output only.
                    dangerouslySetInnerHTML={{
                      __html: renderParagraph(paragraph, sampleService),
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        <Button
          variant="secondary"
          size="sm"
          iconBefore="plus"
          onPress={() => onChange({ body: [...survey.body, ""] })}
        >
          Add paragraph
        </Button>
      </div>
    </FormSection>
  );
}
