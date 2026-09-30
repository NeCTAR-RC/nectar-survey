/** Uploads the downloaded file to the container root, next to the script. */
const UPLOAD_COMMAND =
  'swift upload nectar-survey surveys.json --header "Content-Type: application/json" --header "Cache-Control: public, max-age=0, must-revalidate"';

/** Once per container: keep every replaced version for rollback. */
const HISTORY_COMMANDS = `swift post nectar-survey-history
swift post nectar-survey --header "X-History-Location: nectar-survey-history"`;

/**
 * Lists the saved versions and fetches one. History names are the object
 * name's length in hexadecimal (00c for surveys.json), the name, a slash and
 * a timestamp.
 */
const ROLLBACK_COMMANDS = `swift list nectar-survey-history --prefix 00csurveys.json/
swift download nectar-survey-history "00csurveys.json/<timestamp>" --output surveys.json`;

/**
 * How a downloaded file goes live. The editor never uploads; someone with
 * access to the Swift container runs these commands.
 */
export function PublishPanel() {
  return (
    <div className="publish">
      <ol className="steps">
        <li>
          Check the Problems and Changes tabs, and try the popup in the Preview
          tab.
        </li>
        <li>
          Download <code>surveys.json</code>. The button stays off while there
          are errors.
        </li>
        <li>
          Send the file to someone with access to the <code>nectar-survey</code>{" "}
          container. In the folder with the file, they run:
          <pre>
            <code>{UPLOAD_COMMAND}</code>
          </pre>
        </li>
        <li>
          The popup reads the new file on the next page load of each service. No
          release or restart is needed.
        </li>
      </ol>

      <h3>Roll back</h3>
      <p>
        Once per container, turn on version history, so every upload keeps the
        version it replaces:
      </p>
      <pre>
        <code>{HISTORY_COMMANDS}</code>
      </pre>
      <p>
        To go back, list the saved versions, download the one you want and
        upload it again with the command above:
      </p>
      <pre>
        <code>{ROLLBACK_COMMANDS}</code>
      </pre>

      <h3>Good to know</h3>
      <ul className="plain-list-bulleted">
        <li>
          The live <code>surveys.json</code> exists only in the container. It is
          never part of a code release, so a release never overwrites it.
        </li>
        <li>
          Until a file is published, the popup finds no config and shows
          nothing.
        </li>
      </ul>
    </div>
  );
}
