// One JSON line per significant event. Fields are primitives only; message
// bodies, prompts and credentials never belong here.
export type LogValue = string | number | boolean | null;
export type LogFields = Readonly<Record<string, LogValue | undefined>>;
export type LogWriter = (line: string) => void;

const EVENT_NAME = /^[a-z][a-z0-9_.]{0,63}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SENSITIVE =
  /(secret|password|passphrase|authorization|cookie|api_?key|bearer|access_?token|refresh_?token|session)/i;
const MAX_FIELDS = 40;
const MAX_STRING = 200;
const CONTROL = new RegExp("[\u0000-\u001f\u007f\u2028\u2029]", "g");

function cleanValue(value: LogValue): LogValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return value;
  const flat = value.replace(CONTROL, " ");
  return flat.length > MAX_STRING ? `${flat.slice(0, MAX_STRING)}…` : flat;
}

export function formatEvent(
  event: string,
  fields: LogFields = {},
  now: Date = new Date(),
): string {
  const record: Record<string, LogValue> = {
    ts: now.toISOString(),
    event: EVENT_NAME.test(event) ? event : "invalid_event",
  };
  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || key in record || !FIELD_NAME.test(key)) continue;
    if (++count > MAX_FIELDS) break;
    record[key] = SENSITIVE.test(key) ? "[redacted]" : cleanValue(value);
  }
  return `${JSON.stringify(record)}\n`;
}

const stdoutWriter: LogWriter = (line) => {
  process.stdout.write(line);
};

export function logEvent(
  event: string,
  fields: LogFields = {},
  write: LogWriter = stdoutWriter,
): void {
  try {
    write(formatEvent(event, fields));
  } catch {
    /* Logging must never change application behavior. */
  }
}
