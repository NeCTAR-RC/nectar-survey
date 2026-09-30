import {
  Button,
  CheckboxGroup,
  CheckboxGroupItem,
  Dialog,
  Link,
  Modal,
} from "@ardc-ui/react";
import { useId, useRef, useState } from "react";
import {
  fillService,
  renderText,
  resolveSurveyUrl,
  type Survey,
} from "../config/config.ts";
import "./styles.scss";

export interface SurveyDialogProps {
  survey: Survey;
  /** The host's `service` attribute, substituted for `{service}`. */
  service: string;
  /** The user chose "Start survey"; `dismissed` is the checkbox at that moment. */
  onStart: (dismissed: boolean) => void;
  /** The user closed the popup with the checkbox clear. */
  onLater: () => void;
  /** The user closed the popup with "Don't show me this again" ticked. */
  onDismiss: () => void;
}

const DONT_SHOW_AGAIN = "dont-show-again";

/**
 * The survey invitation: the library's modal dialog with the survey's
 * eyebrow, title and body, "Start survey" and "Not right now" as its
 * actions, and the "Don't show me this again" checkbox beneath them.
 *
 * It opens on mount and reports exactly one choice. Every way of closing it
 * without starting the survey ("Not right now", the close button, Escape, a
 * click on the scrim) goes through the modal's `onOpenChange`, so they all
 * behave alike: `onDismiss` when the box is ticked, otherwise `onLater`.
 */
export function SurveyDialog({
  survey,
  service,
  onStart,
  onLater,
  onDismiss,
}: SurveyDialogProps) {
  const [isOpen, setOpen] = useState(true);
  const [dismissChoice, setDismissChoice] = useState<string[]>([]);
  // A ref rather than state: a second close signal can arrive before React
  // re-renders (Escape straight after a click), and must not report again.
  const reported = useRef(false);
  const eyebrowId = useId();
  const bodyId = useId();

  const dontShowAgain = dismissChoice.includes(DONT_SHOW_AGAIN);
  // The rules only pick a survey that has a url for this service.
  const url = resolveSurveyUrl(survey, service);

  /** Reports a choice once; later calls are ignored. */
  function report(choice: () => void): void {
    if (reported.current) return;
    reported.current = true;
    choice();
  }

  function handleOpenChange(open: boolean): void {
    if (open) return;
    report(dontShowAgain ? onDismiss : onLater);
    setOpen(false);
  }

  function handleStart(): void {
    report(() => onStart(dontShowAgain));
    // Closed on the next task: removing the link while its click is still
    // being handled would cancel the navigation that opens the survey.
    window.setTimeout(() => setOpen(false));
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable>
      <Dialog
        aria-describedby={survey.eyebrow ? `${eyebrowId} ${bodyId}` : bodyId}
        closeLabel="Close"
        title={
          <>
            {survey.eyebrow && (
              // Hidden from the heading so the dialog's name is the title
              // alone; the description still reads it, being referenced.
              <span id={eyebrowId} className="eyebrow" aria-hidden="true">
                {fillService(survey.eyebrow, service)}
              </span>
            )}
            {/* parseConfig escapes the title and renderText the service. */}
            <span
              dangerouslySetInnerHTML={{
                __html: renderText(survey.title, service),
              }}
            />
          </>
        }
        actions={
          <>
            <Link
              variant="primary"
              tone="navigation"
              iconAfter="arrow-up-right-from-square"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              // The primary action takes focus on open, so Enter takes the
              // survey; React Aria returns focus to the page on close.
              autoFocus
              // A middle or modifier click opens the survey through the
              // browser alone and never reaches onPress, so it is not counted
              // as a start; the popup stays until the next choice.
              onPress={handleStart}
            >
              {survey.startLabel}
            </Link>
            <Button variant="link" slot="close">
              {survey.laterLabel}
            </Button>
            <CheckboxGroup
              className="dontShowAgain"
              // A one-item group has no heading, so it borrows its item's
              // label; a screen reader may say the words twice.
              aria-label={survey.dismissLabel}
              value={dismissChoice}
              onChange={setDismissChoice}
            >
              <CheckboxGroupItem value={DONT_SHOW_AGAIN}>
                {survey.dismissLabel}
              </CheckboxGroupItem>
            </CheckboxGroup>
          </>
        }
      >
        <div id={bodyId} className="paragraphs">
          {survey.body.map((paragraph, index) => (
            <p
              // Paragraphs never reorder while the dialog is open.
              key={index}
              // Sanitised by parseConfig; renderText escapes the service.
              dangerouslySetInnerHTML={{
                __html: renderText(paragraph, service),
              }}
            />
          ))}
        </div>
      </Dialog>
    </Modal>
  );
}
