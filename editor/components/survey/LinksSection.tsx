import { Button, FieldError, Label, TextField } from "@ardc-ui/react";
import { effectiveServices } from "../../model/index.ts";
import { help, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * The shared survey link, then one link per service. A link kept for a
 * service the survey no longer lists says so and can be removed.
 */
export function LinksSection({
  survey,
  at,
  fieldId,
  serviceNames,
  onChange,
}: SectionProps) {
  const listedServices = effectiveServices(survey, serviceNames);
  const linkServices = [
    ...new Set([...listedServices, ...Object.keys(survey.urls)]),
  ];

  return (
    <FormSection
      title="Survey links"
      description="Where Start survey takes people."
      info="A service uses its own link when it has one, otherwise the shared link. A service with neither is skipped."
    >
      <div id={fieldId("url")} className="field">
        <TextField
          type="url"
          value={survey.url}
          onChange={(url) => onChange({ url })}
          isInvalid={at("url").errors.length > 0}
        >
          <Label>Shared link</Label>
          {help(
            "Used on every service that has no link of its own below.",
            at("url").warnings,
          )}
          <FieldError>{at("url").errors.join(" ")}</FieldError>
        </TextField>
      </div>
      {linkServices.length > 0 && (
        <div className="field-grid field-grid-2">
          {linkServices.map((service) => {
            const field = `urls.${service}`;
            const listed = listedServices.includes(service);
            return (
              <div id={fieldId(field)} className="field" key={service}>
                <TextField
                  type="url"
                  value={survey.urls[service] ?? ""}
                  onChange={(url) =>
                    onChange({ urls: { ...survey.urls, [service]: url } })
                  }
                  isInvalid={at(field).errors.length > 0}
                >
                  <Label>Link for {service}</Label>
                  {help(
                    listed
                      ? undefined
                      : "This service is not in the survey's service list, so the link is never used.",
                    at(field).warnings,
                  )}
                  <FieldError>{at(field).errors.join(" ")}</FieldError>
                </TextField>
                {!listed && (
                  <Button
                    variant="secondary"
                    tone="danger"
                    size="sm"
                    onPress={() => {
                      const urls = { ...survey.urls };
                      delete urls[service];
                      onChange({ urls });
                    }}
                  >
                    Remove this link
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FormSection>
  );
}
