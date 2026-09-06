import type { RetentionStatus } from "../domain/retention-status.js";

export function RetentionNotice({
  retention,
}: {
  readonly retention: RetentionStatus;
}) {
  const title =
    retention.status === "retained"
      ? "Retained for open GitHub work"
      : retention.status === "unknown"
        ? "GitHub status unknown · content retained"
        : `Scheduled expiry · ${date(retention.expiresAt!)}`;
  return (
    <div className="retention-notice" role="status">
      <p>{title}</p>
      <small>
        {retention.reason}
        {retention.status === "scheduled"
          ? " Once deleted, content is lost."
          : ""}
      </small>
      {retention.checkedAt === null ? null : (
        <small>
          Last checked {date(retention.checkedAt)}. Next check{" "}
          {date(retention.nextCheckAt)}.
        </small>
      )}
    </div>
  );
}

function date(value: string): string {
  return (
    new Date(value).toLocaleString("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}
