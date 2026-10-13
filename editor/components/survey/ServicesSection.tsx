import {
  Button,
  CheckboxGroup,
  CheckboxGroupItem,
  FieldError,
  Label,
  TextField,
} from "@ardc-ui/react";
import {
  applyServiceSelection,
  isKnownService,
  serviceSelection,
} from "../../model/index.ts";
import { help, replaceAt, type SectionProps } from "./fieldHelp.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * Which services show the survey, by exact name: one box per service name
 * the draft knows of, and this survey's names outside the known four as
 * text fields, where a brand-new name is typed. A typed name is ticked and
 * becomes a box in every survey. The checkbox logic lives in
 * `applyServiceSelection`.
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
      info="The popup matches the exact service name each service passes in. A new service needs its own name here."
    >
      <div id={fieldId("services")} className="field">
        <CheckboxGroup
          value={serviceSelection(survey, serviceNames)}
          onChange={(values) =>
            onChange({
              services: applyServiceSelection(survey, values, serviceNames),
            })
          }
          isInvalid={at("services").errors.length > 0}
        >
          <Label>Show this survey on</Label>
          {help(undefined, at("services").warnings)}
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
        </div>
      </div>
    </FormSection>
  );
}
