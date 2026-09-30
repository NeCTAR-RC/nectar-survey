import { Button, Dialog, Modal } from "@ardc-ui/react";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/**
 * Asks before a step that would lose work. Cancel is the safe default:
 * Escape, the close button and the scrim all cancel.
 */
export function ConfirmDialog({
  isOpen,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog
        role="alertdialog"
        title={title}
        closeLabel="Cancel"
        actions={
          <>
            <Button variant="secondary" onPress={onCancel} autoFocus>
              Cancel
            </Button>
            <Button tone="danger" onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </Dialog>
    </Modal>
  );
}
