import { FieldError, Label, Text, TextArea } from "@ardc-ui/react";
import { describeProblem, type JsonProblem } from "../model/index.ts";

interface RawJsonPanelProps {
  text: string;
  problem: JsonProblem | null;
  onChange: (text: string) => void;
}

/**
 * The draft as `surveys.json` text, editable. Text that reads as a config
 * updates the form at once; anything else is reported with its line and
 * column and pauses the form until it is fixed.
 */
export function RawJsonPanel({ text, problem, onChange }: RawJsonPanelProps) {
  return (
    <TextArea
      className="raw-json"
      value={text}
      onChange={onChange}
      isInvalid={problem !== null}
    >
      <Label>surveys.json</Label>
      <Text slot="description">
        Changes here update the form straight away. A change in the form
        rewrites this text with the keys in the standard order.
      </Text>
      <FieldError>{problem ? describeProblem(problem) : ""}</FieldError>
    </TextArea>
  );
}
