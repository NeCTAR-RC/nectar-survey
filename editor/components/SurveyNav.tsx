import {
  Accordion,
  AccordionItem,
  Button,
  Label,
  SearchField,
  Select,
  SelectItem,
  Tag,
  TagGroup,
  TagList,
} from "@ardc-ui/react";
import { useState } from "react";
import {
  DEFAULT_FILTER,
  errorCounts,
  filterSurveys,
  isFilterActive,
  isShowingNow,
  serviceNames,
  withShowingNow,
  type Draft,
  type DraftSurvey,
  type SurveyFilter,
  type SurveyTiming,
  type Validation,
} from "../model/index.ts";
import { plural } from "../plural.ts";
import type { EditorAction } from "../state.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

interface SurveyNavProps {
  draft: Draft;
  validation: Validation;
  filter: SurveyFilter;
  onFilterChange: (filter: SurveyFilter) => void;
  /** Index of the selected survey, or -1 when none is selected. */
  selectedIndex: number;
  /** Selects the survey at `index`, from a row of the list. */
  onSelect: (index: number) => void;
  /** True while the raw JSON does not parse; the whole pane is inert. */
  isPaused: boolean;
  dispatch: (action: EditorAction) => void;
}

/** One chip of a filter group: the filter value and the chip's words. */
interface Choice<T extends string> {
  id: T;
  label: string;
}

const POPUP_CHOICES: Choice<"showing-now">[] = [
  { id: "showing-now", label: "Would show now" },
];

const DATES_CHOICES: Choice<SurveyTiming>[] = [
  { id: "open", label: "Open now" },
  { id: "upcoming", label: "Upcoming" },
  { id: "closed", label: "Closed" },
];

const STATUS_CHOICES: Choice<"enabled" | "disabled">[] = [
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
];

const ARCHIVE_CHOICES: Choice<"current" | "archived">[] = [
  { id: "current", label: "Current" },
  { id: "archived", label: "Archived" },
];

/** Between the words of a row's states line: "Disabled · Upcoming". */
const STATE_SEPARATOR = " · ";

/** The Service select's key for "no service chosen". */
const ANY_SERVICE = "any";

/**
 * The survey list pane: the "Surveys" heading with Add survey, a search box,
 * the filters folded into a closed "Filters" accordion, a line counting the
 * matches and the list of matching surveys in file order. The count line and
 * its "Clear filters" sit outside the accordion, so an active filter shows
 * while it is closed. A row selects its survey, whose form the editor
 * then shows on its own.
 *
 * The selected survey is always listed, even when it stops matching the
 * filters or the search: editing a survey (closing it, disabling it,
 * changing its title) must never make the form jump to another one. When it
 * does not match, it comes after the matches under the caption "Selected,
 * outside the filter", so it never reads as a result. The count line counts
 * the matches only, without that pinned row.
 *
 * While archived surveys are listed and any exist, "Remove archived surveys"
 * under the list removes them all after a confirmation.
 */
export function SurveyNav({
  draft,
  validation,
  filter,
  onFilterChange,
  selectedIndex,
  onSelect,
  isPaused,
  dispatch,
}: SurveyNavProps) {
  const [isRemovingArchived, setIsRemovingArchived] = useState(false);
  const count = draft.surveys.length;
  const matches = filterSurveys(draft, validation, filter);
  const pinned =
    selectedIndex !== -1 && !matches.includes(selectedIndex)
      ? selectedIndex
      : undefined;
  const errors = errorCounts(validation, count);
  const archived = draft.surveys.flatMap((survey, index) =>
    survey.archived ? [index] : [],
  );
  const offersRemoveArchived =
    filter.archive !== "current" && archived.length > 0;

  const update = (patch: Partial<SurveyFilter>): void =>
    onFilterChange({ ...filter, ...patch });

  const row = (index: number) => (
    <SurveyRow
      survey={draft.surveys[index]}
      index={index}
      timing={validation.timing[index]}
      errorCount={errors[index]}
      isSelected={index === selectedIndex}
      onSelect={() => onSelect(index)}
    />
  );

  return (
    <aside
      className="survey-nav"
      aria-labelledby="surveys-heading"
      inert={isPaused}
    >
      <div className="surveys-header">
        <h2 id="surveys-heading">Surveys</h2>
        <Button
          variant="secondary"
          size="sm"
          className="surveys-add"
          isDisabled={isPaused}
          iconBefore="plus"
          onPress={() => dispatch({ type: "add-survey" })}
        >
          Add survey
        </Button>
      </div>

      <SearchField
        size="sm"
        aria-label="Find a survey"
        placeholder="Find by id or title"
        value={filter.search}
        onChange={(search) => update({ search })}
      />

      <Accordion headingLevel={3}>
        <AccordionItem id="filters" title="Filters">
          <ChoiceGroup
            label="Popup"
            choices={POPUP_CHOICES}
            value={isShowingNow(filter) ? "showing-now" : undefined}
            onChange={(value) =>
              onFilterChange(withShowingNow(filter, value !== undefined))
            }
          />
          <ChoiceGroup
            label="Dates"
            choices={DATES_CHOICES}
            value={filter.dates}
            onChange={(dates) => update({ dates })}
          />
          <ChoiceGroup
            label="Status"
            choices={STATUS_CHOICES}
            value={filter.status}
            onChange={(status) => update({ status })}
          />
          <ChoiceGroup
            label="Archive"
            choices={ARCHIVE_CHOICES}
            value={filter.archive}
            onChange={(archive) => update({ archive })}
          />
          <Select
            labelPosition="top"
            value={filter.service ?? ANY_SERVICE}
            onChange={(key) =>
              update({
                service:
                  key === ANY_SERVICE || typeof key !== "string"
                    ? undefined
                    : key,
              })
            }
          >
            <Label>Service</Label>
            <SelectItem id={ANY_SERVICE}>Any service</SelectItem>
            {serviceNames(draft).map((service) => (
              <SelectItem key={service} id={service}>
                {service}
              </SelectItem>
            ))}
          </Select>
        </AccordionItem>
      </Accordion>

      <div className="survey-count">
        <p aria-live="polite">
          {matches.length} of {count} match
        </p>
        {isFilterActive(filter) && (
          <Button
            variant="link"
            size="sm"
            onPress={() => onFilterChange(DEFAULT_FILTER)}
          >
            Clear filters
          </Button>
        )}
      </div>

      {matches.length > 0 || pinned !== undefined ? (
        <ol className="survey-rows">
          {matches.map((index) => (
            <li key={draft.surveys[index].key}>{row(index)}</li>
          ))}
          {pinned !== undefined && (
            <li key={draft.surveys[pinned].key} className="survey-rows-pinned">
              <p className="survey-row-caption">Selected, outside the filter</p>
              {row(pinned)}
            </li>
          )}
        </ol>
      ) : (
        <p className="empty-state">
          {count === 0
            ? "No surveys yet. Add a survey, or use Load to replace the draft."
            : "No survey matches. Clear the filters or change the search."}
        </p>
      )}

      {offersRemoveArchived && (
        <div className="survey-nav-footer">
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onPress={() => setIsRemovingArchived(true)}
          >
            Remove archived surveys
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={isRemovingArchived}
        title={`Remove ${plural(archived.length, "archived survey")}?`}
        confirmLabel="Remove archived surveys"
        onCancel={() => setIsRemovingArchived(false)}
        onConfirm={() => {
          dispatch({ type: "remove-surveys", indices: archived });
          setIsRemovingArchived(false);
        }}
      >
        <p>
          Every archived survey leaves the draft. They stay in the live file
          until a new file is published.
        </p>
      </ConfirmDialog>
    </aside>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  choices: Choice<T>[];
  /** The chosen chip, or undefined for "any". */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}

/**
 * One filter group as a row of chips, at most one chosen. Choosing the
 * chosen chip again clears it, which means "any".
 */
function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <TagGroup
      selectionMode="single"
      selectedKeys={value === undefined ? [] : [value]}
      onSelectionChange={(keys) => {
        const [chosen] = keys === "all" ? [] : [...keys];
        onChange(choices.find((choice) => choice.id === chosen)?.id);
      }}
    >
      <Label>{label}</Label>
      <TagList>
        {choices.map((choice) => (
          <Tag key={choice.id} id={choice.id}>
            {choice.label}
          </Tag>
        ))}
      </TagList>
    </TagGroup>
  );
}

interface SurveyRowProps {
  survey: DraftSurvey;
  index: number;
  timing: SurveyTiming | undefined;
  errorCount: number;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * One survey in the list: its number in the file and its id, its title on
 * one line, and a line of words only for what needs noticing (off, not open,
 * archived, errors).
 */
function SurveyRow({
  survey,
  index,
  timing,
  errorCount,
  isSelected,
  onSelect,
}: SurveyRowProps) {
  const states = [
    !survey.enabled && "Disabled",
    timing === "closed" && "Closed",
    timing === "upcoming" && "Upcoming",
    survey.archived && "Archived",
  ].filter((state) => state !== false);
  const errors = errorCount > 0 ? plural(errorCount, "error") : undefined;

  return (
    <button
      type="button"
      className="survey-row"
      aria-current={isSelected ? "true" : undefined}
      onClick={onSelect}
    >
      <span className="survey-row-line">
        <span className="survey-row-number">{index + 1}</span>
        {survey.id !== "" ? (
          <span className="survey-row-id">{survey.id}</span>
        ) : (
          <span className="survey-row-unset">No id yet</span>
        )}
      </span>
      {survey.title !== "" ? (
        <span className="survey-row-title">{survey.title}</span>
      ) : (
        <span className="survey-row-title survey-row-unset">No title yet</span>
      )}
      {(states.length > 0 || errors) && (
        <span className="survey-row-states">
          {states.join(STATE_SEPARATOR)}
          {states.length > 0 && errors && STATE_SEPARATOR}
          {errors && <span className="survey-row-errors">{errors}</span>}
        </span>
      )}
    </button>
  );
}
