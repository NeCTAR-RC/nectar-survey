import {
  Alert,
  Button,
  DateField,
  FieldError,
  Label,
  Select,
  SelectItem,
  Switch,
  Text,
  TextField,
} from "@ardc-ui/react";
import type { CalendarDateTime } from "@internationalized/date";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearAllState, readState } from "../../src/config/storage.ts";
import { copyText } from "../io.ts";
import {
  KNOWN_SERVICES,
  serviceNames,
  minuteText,
  previewConfig,
  previewLink,
  previewOutcome,
  SAMPLE_SURVEY_URL,
  SERVICE_PAGES,
  type Draft,
  type PreviewOutcome,
} from "../model/index.ts";
import { notify } from "../toasts.ts";

interface PreviewPanelProps {
  draft: Draft;
}

/** The popup element as the editor uses it; `resetState` is its static API. */
type PopupElementClass = CustomElementConstructor & { resetState?: () => void };

const ELEMENT_NAME = "nectar-survey";
const EVENTS = ["open", "start", "later", "dismiss"] as const;
const SCRIPT_TIMEOUT_MS = 10_000;
const AS_IF_LIVE_HELP_ID = "preview-as-if-live-help";

/**
 * How long Copy link shows its copied glyph after a successful copy, in
 * milliseconds; the same two seconds as Copy JSON.
 */
const COPIED_DURATION = 2000;

/** The page select's key for an address typed or pasted by hand. */
const OTHER_PAGE = "other";

interface PreviewSettings {
  service: string;
  /** The time the popup pretends it is; empty means now. */
  now: CalendarDateTime | null;
  /**
   * Treat every survey that is not archived as live and fill in a sample
   * link, for an early look.
   */
  asIfLive: boolean;
}

interface LogEntry {
  at: string;
  event: string;
  surveyId: string;
}

/**
 * Waits for `./nectar-survey.js` (a module script in the page) to define the
 * element. Resolves undefined when it has not arrived within the timeout.
 */
function whenPopupDefined(): Promise<PopupElementClass | undefined> {
  return Promise.race([
    customElements.whenDefined(ELEMENT_NAME),
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), SCRIPT_TIMEOUT_MS),
    ),
  ]);
}

/** The config text the preview mounts for `settings`. */
function configFor(draft: Draft, settings: PreviewSettings): string {
  return JSON.stringify(previewConfig(draft, settings.asIfLive));
}

/**
 * The real popup on the current draft. Each "Show popup" mounts a fresh
 * element whose `config-url` is a blob of the draft, for the chosen service
 * and time. Changing a preview setting shows it again; editing the draft does
 * not, because the popup is modal and would take focus from the form.
 */
export function PreviewPanel({ draft }: PreviewPanelProps) {
  const services = useMemo(() => serviceNames(draft), [draft]);
  const [settings, setSettings] = useState<PreviewSettings>({
    service: KNOWN_SERVICES[0],
    now: null,
    asIfLive: true,
  });
  const [outcome, setOutcome] = useState<PreviewOutcome | null>(null);
  const [shownJson, setShownJson] = useState<string | null>(null);
  const [scriptMissing, setScriptMissing] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  /** Mounts a fresh popup element for `next` on the current draft. */
  const show = async (next: PreviewSettings): Promise<void> => {
    const popupClass = await whenPopupDefined();
    const host = hostRef.current;
    if (!host) return;
    if (!popupClass) {
      setScriptMissing(true);
      return;
    }
    setScriptMissing(false);

    const config = previewConfig(draft, next.asIfLive);
    const configJson = JSON.stringify(config);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(
      new Blob([configJson], { type: "application/json" }),
    );
    blobUrlRef.current = url;

    const nowText = minuteText(next.now);
    // Worked out before mounting, because the element records the showing.
    setOutcome(
      previewOutcome(config, {
        service: next.service,
        now: nowText ? new Date(nowText) : new Date(),
        // The editor page is not opened in preview mode (see previewConfig).
        preview: false,
        readState,
      }),
    );
    setShownJson(configJson);

    const element = document.createElement(ELEMENT_NAME);
    element.setAttribute("service", next.service);
    element.setAttribute("config-url", url);
    if (nowText) element.setAttribute("now", nowText);
    host.replaceChildren(element);
  };

  /** A preview setting changed: show again if something is showing. */
  const update = (patch: Partial<PreviewSettings>): void => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (shownJson !== null) void show(next);
  };

  const reset = (): void => {
    const popupClass = customElements.get(ELEMENT_NAME) as
      PopupElementClass | undefined;
    if (typeof popupClass?.resetState === "function") popupClass.resetState();
    else clearAllState();
    setLog([]);
    void show(settings);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const record = (event: Event): void => {
      const detail = (event as CustomEvent<{ surveyId?: string }>).detail;
      setLog((entries) => [
        {
          at: new Date().toLocaleTimeString("en-AU"),
          event: event.type.replace("nectar-survey:", ""),
          surveyId: detail?.surveyId ?? "",
        },
        ...entries,
      ]);
    };
    for (const name of EVENTS) {
      host.addEventListener(`nectar-survey:${name}`, record);
    }
    return () => {
      for (const name of EVENTS) {
        host.removeEventListener(`nectar-survey:${name}`, record);
      }
      host.replaceChildren();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    };
  }, []);

  const isStale =
    shownJson !== null && shownJson !== configFor(draft, settings);

  return (
    <div className="preview">
      <div className="preview-controls">
        <Select
          value={settings.service}
          onChange={(key) => {
            if (typeof key === "string") update({ service: key });
          }}
        >
          <Label>Service</Label>
          <Text slot="description">Whose name goes into the text.</Text>
          {services.map((name) => (
            <SelectItem key={name} id={name}>
              {name}
            </SelectItem>
          ))}
        </Select>
        <DateField
          granularity="minute"
          value={settings.now}
          onChange={(now) => update({ now })}
        >
          <Label>Pretend it is</Label>
          <Text slot="description">Leave empty for now.</Text>
        </DateField>
      </div>
      <div className="field">
        <Switch
          isSelected={settings.asIfLive}
          onChange={(asIfLive) => update({ asIfLive })}
          aria-describedby={AS_IF_LIVE_HELP_ID}
        >
          Treat every survey as live
        </Switch>
        <p id={AS_IF_LIVE_HELP_ID} className="field-help">
          A survey without a link uses {SAMPLE_SURVEY_URL}, and a draft or
          preview survey shows as if live: this page is not opened in preview
          mode. Nothing here changes the draft.
        </p>
      </div>

      <div className="field">
        <div className="preview-actions">
          <Button onPress={() => void show(settings)}>Show popup</Button>
          <Button variant="secondary" onPress={reset}>
            Reset saved state
          </Button>
        </div>
        <p className="field-help">
          The popup remembers what you choose in it, as it would for a user.
          Reset saved state to see it again.
        </p>
      </div>

      {scriptMissing && (
        <Alert tone="danger">
          The popup script (nectar-survey.js) did not load, so there is nothing
          to preview. Check the connection and reload the page.
        </Alert>
      )}
      <div role="status" className="preview-outcome">
        {outcome && <OutcomeText outcome={outcome} />}
        {isStale && (
          <p>
            The draft has changed since this preview. Show popup again to see
            it.
          </p>
        )}
      </div>

      <div ref={hostRef} className="preview-host" />

      <section aria-labelledby="preview-log-heading" className="preview-log">
        <h3 id="preview-log-heading">Popup events</h3>
        {log.length === 0 ? (
          <p className="field-help">None yet.</p>
        ) : (
          <ol className="plain-list">
            {log.map((entry, index) => (
              <li key={log.length - index}>
                <span className="log-time">{entry.at}</span> {entry.event}{" "}
                <code>{entry.surveyId}</code>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ServiceLink now={minuteText(settings.now)} />
    </div>
  );
}

/**
 * "Try it on a service": the link that opens a real service page in preview
 * mode, where preview surveys show, at the panel's pretend time when one is
 * set. The page is a known service's home page or any address typed in, such
 * as a development VM, a review site or a local harness.
 */
function ServiceLink({ now }: { now: string }) {
  const [page, setPage] = useState<string>(KNOWN_SERVICES[0]);
  const [otherAddress, setOtherAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOther = page === OTHER_PAGE;
  const address = isOther
    ? otherAddress
    : SERVICE_PAGES[page as keyof typeof SERVICE_PAGES];
  const link = previewLink(address, now);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const copy = async (): Promise<void> => {
    if (link === undefined) return;
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_DURATION);
    }
    notify(
      ok
        ? { tone: "success", description: "Copied the link to the clipboard." }
        : {
            tone: "warning",
            description:
              "The browser did not allow copying. Select the link and copy it instead.",
          },
    );
  };

  return (
    <section aria-labelledby="service-link-heading" className="service-link">
      <div>
        <h3 id="service-link-heading">Try it on a service</h3>
        <p className="field-help">
          Opens a real service page with preview surveys showing. They show on
          that page only, so open each page you want to check with a link from
          here.
          {now !== "" && ` It pretends it is the time set above (${now}).`}
        </p>
      </div>
      <div className="preview-controls">
        <Select
          value={page}
          onChange={(key) => {
            if (typeof key === "string") setPage(key);
          }}
        >
          <Label>Page</Label>
          <Text slot="description">The page the link opens.</Text>
          {KNOWN_SERVICES.map((name) => (
            <SelectItem key={name} id={name}>
              {name}
            </SelectItem>
          ))}
          <SelectItem id={OTHER_PAGE}>Another address</SelectItem>
        </Select>
        {isOther && (
          <TextField
            type="url"
            value={otherAddress}
            onChange={setOtherAddress}
            isInvalid={otherAddress.trim() !== "" && link === undefined}
          >
            <Label>Page address</Label>
            <Text slot="description">
              A development VM, a review site or a local harness.
            </Text>
            <FieldError>
              Enter a full web address starting with https:// (or http://).
            </FieldError>
          </TextField>
        )}
      </div>
      {link !== undefined && (
        <div className="service-link-result">
          <code>{link}</code>
          <div>
            <Button
              variant="secondary"
              size="sm"
              iconBefore={copied ? "copy-check" : "copy"}
              onPress={() => void copy()}
            >
              Copy link
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function OutcomeText({ outcome }: { outcome: PreviewOutcome }) {
  return (
    <>
      <p>
        {outcome.shownId !== undefined
          ? `The popup shows "${outcome.shownId}".`
          : "The popup shows nothing."}
      </p>
      {outcome.skipped.length > 0 && (
        <ul className="plain-list">
          {outcome.skipped.map(({ id, reason }, index) => (
            <li key={index}>
              {id ? `"${id}"` : "A survey without an id"}: {reason}.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
