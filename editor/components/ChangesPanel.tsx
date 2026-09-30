import {
  Alert,
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import { describeProblem, diff, type Draft } from "../model/index.ts";
import type { LiveState } from "../state.ts";

interface ChangesPanelProps {
  live: LiveState;
  draft: Draft;
}

/**
 * What publishing the draft would change: surveys added and removed, and
 * every changed field of the surveys in both, as a plain list.
 */
export function ChangesPanel({ live, draft }: ChangesPanelProps) {
  switch (live.status) {
    case "loading":
      return <p>Checking the live file&hellip;</p>;
    case "failed":
      return (
        <Alert tone="warning">
          The live file could not be checked. {live.message} To try again,
          choose Load, then The live file.
        </Alert>
      );
    case "invalid":
      return (
        <Alert tone="warning">
          The live file is not a valid config ({describeProblem(live.problem)}
          ). Publishing this draft replaces it.
        </Alert>
      );
    case "missing":
      return (
        <>
          <Alert tone="info">
            Nothing is published yet, so everything in this draft is new.
          </Alert>
          <SurveyIds
            heading="New surveys"
            ids={draft.surveys.map((s) => s.id)}
          />
        </>
      );
    case "loaded":
      return <LoadedChanges live={live.draft} draft={draft} />;
  }
}

function LoadedChanges({ live, draft }: { live: Draft; draft: Draft }) {
  const { added, removed, changes } = diff(live, draft);
  if (added.length + removed.length + changes.length === 0) {
    return (
      <Alert tone="success">No changes. The draft matches the live file.</Alert>
    );
  }
  return (
    <div className="changes">
      <SurveyIds heading="New surveys" ids={added} />
      <SurveyIds heading="Removed surveys" ids={removed} />
      {changes.length > 0 && (
        <section>
          <h3 id="changed-fields-heading">Changed fields</h3>
          <Table aria-labelledby="changed-fields-heading">
            <TableHeader>
              <Column isRowHeader>Survey</Column>
              <Column>Field</Column>
              <Column>Live</Column>
              <Column>Draft</Column>
            </TableHeader>
            <TableBody>
              {changes.map((change, index) => (
                <Row key={index} id={index}>
                  <Cell>{change.surveyId || "Whole file"}</Cell>
                  <Cell>{change.field}</Cell>
                  <Cell>
                    <Value text={change.from} />
                  </Cell>
                  <Cell>
                    <Value text={change.to} />
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

function SurveyIds({ heading, ids }: { heading: string; ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <section>
      <h3>{heading}</h3>
      <ul className="plain-list">
        {ids.map((id, index) => (
          <li key={index}>{id || "(no id yet)"}</li>
        ))}
      </ul>
    </section>
  );
}

function Value({ text }: { text: string }) {
  return text === "" ? (
    <span className="value-unset">Not set</span>
  ) : (
    <span className="value">{text}</span>
  );
}
