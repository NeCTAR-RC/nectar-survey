import { Button, Dialog, Label, Modal, Text, TextArea } from "@ardc-ui/react";
import { useState } from "react";

interface PasteDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onLoad: (text: string) => void;
}

/** A dialog for pasting the text of a `surveys.json` file. */
export function PasteDialog({ isOpen, onCancel, onLoad }: PasteDialogProps) {
  const [pasted, setPasted] = useState("");

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog
        title="Paste JSON"
        closeLabel="Cancel"
        actions={
          <>
            <Button variant="secondary" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              isDisabled={pasted.trim() === ""}
              onPress={() => {
                onLoad(pasted);
                setPasted("");
              }}
            >
              Load pasted JSON
            </Button>
          </>
        }
      >
        <TextArea
          className="raw-json"
          value={pasted}
          onChange={setPasted}
          autoFocus
        >
          <Label>Contents of a surveys.json file</Label>
          <Text slot="description">
            Text that is not valid JSON opens in the JSON tab, where the problem
            is marked.
          </Text>
        </TextArea>
      </Dialog>
    </Modal>
  );
}
