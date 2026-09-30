import {
  Badge,
  Button,
  Menu,
  MenuItem,
  MenuSection,
  MenuSectionHeader,
  MenuTrigger,
  Tooltip,
  TooltipTrigger,
  type Key,
} from "@ardc-ui/react";
import type { ReactNode, Ref } from "react";
import type { LoadRoute } from "./loadRoutes.ts";

interface EditorHeaderProps {
  ref: Ref<HTMLElement>;
  /** Where the draft came from, as one sentence. */
  status: string;
  /** False on the start screen, where there is nothing to save or replace. */
  hasDraft: boolean;
  unsaved: boolean;
  isLoadingLive: boolean;
  /** Why the download is off, or undefined when it is available. */
  downloadBlockedBecause?: string;
  onLoad: (route: LoadRoute) => void;
  /** True for a moment after a successful copy; Copy JSON shows the copied glyph. */
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

const LOAD_ROUTES: { route: LoadRoute; label: string }[] = [
  { route: "live", label: "The live file" },
  { route: "file", label: "A file from this computer" },
  { route: "paste", label: "Pasted JSON" },
  { route: "template", label: "The template" },
];

/**
 * The page header: the title, the three page actions and a status strip
 * saying where the draft came from and whether it is saved. While Download
 * is off, the strip says why, so nobody has to guess.
 */
export function EditorHeader({
  ref,
  status,
  hasDraft,
  unsaved,
  isLoadingLive,
  downloadBlockedBecause,
  onLoad,
  copied,
  onCopy,
  onDownload,
}: EditorHeaderProps) {
  const downloadOff = downloadBlockedBecause !== undefined;

  return (
    <header ref={ref} className="editor-header">
      <div className="editor-header-inner">
        <div className="editor-header-row">
          <div className="editor-heading">
            <h1>Survey popup config</h1>
            <p className="editor-subtitle">
              Edit the surveys that invite Nectar users to take part, check
              them, then publish the file.
            </p>
          </div>
          {hasDraft && (
            <div className="editor-actions">
              <MenuTrigger>
                <WithTooltip text="Replace the draft with another config.">
                  <Button variant="secondary" size="sm" chevronRight>
                    Load
                  </Button>
                </WithTooltip>
                <Menu
                  placement="bottom end"
                  disabledKeys={isLoadingLive ? ["live"] : []}
                  onAction={(key: Key) => onLoad(key as LoadRoute)}
                >
                  <MenuSection>
                    <MenuSectionHeader>
                      Replace the draft with
                    </MenuSectionHeader>
                    {LOAD_ROUTES.map(({ route, label }) => (
                      <MenuItem key={route} id={route}>
                        {label}
                      </MenuItem>
                    ))}
                  </MenuSection>
                </Menu>
              </MenuTrigger>
              <WithTooltip text="Copy the draft as JSON to the clipboard.">
                <Button
                  variant="secondary"
                  size="sm"
                  iconBefore={copied ? "copy-check" : "copy"}
                  onPress={onCopy}
                >
                  Copy JSON
                </Button>
              </WithTooltip>
              <WithTooltip text="Save the draft as surveys.json for uploading to the container.">
                <Button size="sm" isDisabled={downloadOff} onPress={onDownload}>
                  Download surveys.json
                </Button>
              </WithTooltip>
            </div>
          )}
        </div>
        <p className="editor-status">
          <span>{status}</span>
          {hasDraft && (
            <Badge>{unsaved ? "Unsaved changes" : "Up to date"}</Badge>
          )}
          {hasDraft && downloadOff && (
            <span className="editor-status-reason">
              {downloadBlockedBecause}
            </span>
          )}
        </p>
      </div>
    </header>
  );
}

/** A one-sentence tooltip on hover and keyboard focus of its trigger. */
function WithTooltip({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  return (
    <TooltipTrigger>
      {children}
      <Tooltip>{text}</Tooltip>
    </TooltipTrigger>
  );
}
