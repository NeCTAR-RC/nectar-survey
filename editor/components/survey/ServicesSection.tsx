import {
  Button,
  CheckboxGroup,
  CheckboxGroupItem,
  FieldError,
  Label,
  TextField,
} from "@ardc-ui/react";
import {
  ALL_SERVICES_OPTION,
  applyServiceSelection,
  isKnownService,
  serviceSelection,
} from "../../model/index.ts";
import { help, replaceAt, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * Which services show the survey: "All services" as a select-all over every
 * service name the draft knows of, one box per name, and this survey's names
 * outside the known four as text fields, where a brand-new name is typed.
 * The text fields show with All services on too: a name typed there is
 * ticked like the rest and becomes a box in every survey. The checkbox logic
 * lives in `applyServiceSelection`.
 */
export function ServicesSection({
  survey,
  at,
  fieldId,
  serviceNames,
  onChange,
}: SectionProps) {
  const extraServices = survey.services.filter(
    (service) => !isKnownService(service),
  );
  const knownChosen = survey.services.filter(isKnownService);
  const setExtraServices = (extra: string[]): void =>
    onChange({ services: [...knownChosen, ...extra] });

  return (
    <FormSection
      title="Services"
      description="Where the popup offers this survey."
      info="The popup matches the exact service name each service passes in. All services ticks itself once every service is ticked, and means every service, including any added later."
    >
      <div id={fieldId("services")} className="field">
        <CheckboxGroup
          value={serviceSelection(survey, serviceNames)}
          onChange={(values) =>
            onChange(applyServiceSelection(survey, values, serviceNames))
          }
          isInvalid={at("services").errors.length > 0}
        >
          <Label>Show this survey on</Label>
          {help(undefined, at("services").warnings)}
          <CheckboxGroupItem value={ALL_SERVICES_OPTION}>
            All services
          </CheckboxGroupItem>
          {serviceNames.map((service) => (
            <CheckboxGroupItem key={service} value={service}>
              {service}
            </CheckboxGroupItem>
          ))}
          <FieldError>{at("services").errors.join(" ")}</FieldError>
        </CheckboxGroup>
        <div className="field-list">
          {extraServices.map((service, extraIndex) => (
            <div className="field-list-item" key={extraIndex}>
              <TextField
                value={service}
                onChange={(value) =>
                  setExtraServices(replaceAt(extraServices, extraIndex, value))
                }
              >
                <Label>Other service name {extraIndex + 1}</Label>
              </TextField>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() =>
                  setExtraServices(
                    extraServices.filter((_, i) => i !== extraIndex),
                  )
                }
                aria-label={`Remove other service name ${extraIndex + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="link"
            size="sm"
            iconBefore="plus"
            onPress={() => setExtraServices([...extraServices, ""])}
          >
            Add another service name
          </Button>
          {survey.allServices && extraServices.length > 0 && (
            <p className="field-help">
              The file says only &quot;all&quot; for this survey, so a name
              typed here is kept only through a link of its own under Survey
              links, or through another survey that lists it by name.
            </p>
          )}
        </div>
      </div>
    </FormSection>
  );
}
