import { Alert } from "@ardc-ui/react";
import { useState } from "react";
import {
  issuesForSurvey,
  serviceNames,
  surveyName,
  type Draft,
  type Validation,
} from "../model/index.ts";
import type { EditorAction } from "../state.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SurveyForm } from "./SurveyForm.tsx";

interface SelectedSurveyProps {
  draft: Draft;
  validation: Validation;
  /** Index of the survey to show, or -1 when none is selected. */
  index: number;
  /** True while the raw JSON does not parse; the form is paused. */
  isPaused: boolean;
  dispatch: (action: EditorAction) => void;
}

/**
 * The form column: the selected survey's form on its own, with the
 * confirmation its Remove button asks for. While the raw JSON is broken a
 * warning heads the column and the form is inert. With no survey selected
 * the column holds nothing else.
 */
export function SelectedSurvey({
  draft,
  validation,
  index,
  isPaused,
  dispatch,
}: SelectedSurveyProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const survey = draft.surveys[index];

  return (
    <>
      {isPaused && (
        <Alert tone="warning" className="form-paused">
          The form is paused because the text in the JSON tab is not valid yet.
          Fix it there, or load another file.
        </Alert>
      )}
      {survey && (
        <div className="editor-work" inert={isPaused}>
          <SurveyForm
            key={survey.key}
            survey={survey}
            index={index}
            count={draft.surveys.length}
            issues={issuesForSurvey(validation, index)}
            isClosed={validation.timing[index] === "closed"}
            serviceNames={serviceNames(draft)}
            onChange={(patch) =>
              dispatch({ type: "update-survey", index, patch })
            }
            onMove={(offset) =>
              dispatch({ type: "move-survey", index, offset })
            }
            onDuplicate={() => dispatch({ type: "duplicate-survey", index })}
            onArchive={(archive) =>
              dispatch({
                type: "update-survey",
                index,
                patch: { archived: archive },
              })
            }
            onRemove={() => setIsRemoving(true)}
          />
        </div>
      )}
      <ConfirmDialog
        isOpen={isRemoving && survey !== undefined}
        title={`Remove ${survey ? surveyName(survey) : "this survey"}?`}
        confirmLabel="Remove survey"
        onCancel={() => setIsRemoving(false)}
        onConfirm={() => {
          dispatch({ type: "remove-survey", index });
          setIsRemoving(false);
        }}
      >
        <p>
          {survey?.id
            ? `"${survey.id}" and everything in it leaves the draft.`
            : "The survey and everything in it leaves the draft."}
          {survey?.liveId !== undefined &&
            " It stays in the live file until a new file is published."}
        </p>
      </ConfirmDialog>
    </>
  );
}
