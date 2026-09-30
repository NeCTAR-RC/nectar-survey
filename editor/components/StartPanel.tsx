import { Button, Card, CardTitle } from "@ardc-ui/react";
import type { LiveState } from "../state.ts";
import type { LoadRoute } from "./loadRoutes.ts";

interface StartPanelProps {
  live: LiveState;
  onLoad: (route: LoadRoute) => void;
}

interface StartOption {
  route: LoadRoute;
  title: string;
  description: string;
  action: string;
  isDisabled?: boolean;
}

/**
 * The first screen, while nothing is loaded: the four ways to start, each
 * explained on its own card. The live card follows the automatic request for
 * the live file, so it says when there is nothing to load.
 */
export function StartPanel({ live, onLoad }: StartPanelProps) {
  const options: StartOption[] = [
    liveOption(live),
    {
      route: "file",
      title: "Open a file",
      description:
        "A surveys.json saved on this computer, for example one you downloaded earlier. You can also drop the file anywhere on this page.",
      action: "Open file",
    },
    {
      route: "paste",
      title: "Paste JSON",
      description:
        "Text copied from somewhere else, such as a chat message or an email.",
      action: "Paste JSON",
    },
    {
      route: "template",
      title: "Start from the template",
      description:
        "One disabled survey with the standard wording. Use it for the first survey, or to start over.",
      action: "Start from template",
    },
  ];

  return (
    <section className="start" aria-label="Start">
      <p className="start-lead">Choose where to start.</p>
      <ul className="start-options">
        {options.map((option) => (
          <li key={option.route}>
            <Card tone="white" className="start-card">
              <CardTitle headingLevel={2}>{option.title}</CardTitle>
              <p className="start-card-description">{option.description}</p>
              <Button
                variant="secondary"
                size="sm"
                className="start-card-action"
                isDisabled={option.isDisabled}
                onPress={() => onLoad(option.route)}
              >
                {option.action}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The live card, as the request for the live file stands. */
function liveOption(live: LiveState): StartOption {
  const base = {
    route: "live",
    title: "Load the live file",
    description:
      "The surveys.json the services are using right now. Edit it to change what users see.",
    action: "Load live",
  } as const;
  switch (live.status) {
    case "loading":
      return { ...base, action: "Checking...", isDisabled: true };
    case "missing":
      return {
        ...base,
        description: `${base.description} None is published yet, so there is nothing to load: start from the template or open a file.`,
        isDisabled: true,
      };
    case "failed":
      return {
        ...base,
        description: `The live file could not be loaded. ${live.message} Try again, or start another way.`,
      };
    default:
      return base;
  }
}
