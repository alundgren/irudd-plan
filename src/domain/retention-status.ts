export const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = 30 * DAY_MS;

export interface RetentionStatus {
  readonly status: "scheduled" | "retained" | "unknown";
  readonly reason: string;
  readonly createdAt: string;
  readonly checkedAt: string | null;
  readonly nextCheckAt: string;
  readonly inactiveSince: string | null;
  readonly expiresAt: string | null;
}

export function retentionStatus(row: {
  createdAt: string;
  everAttached: boolean;
  retentionStatus: RetentionStatus["status"];
  retentionReason: string | null;
  retentionCheckedAt: string | null;
  retentionNextCheckAt: string;
  inactiveSince: string | null;
  expiresAt: string | null;
}): RetentionStatus {
  const createdAt = new Date(utcTimestamp(row.createdAt)).toISOString();
  return {
    status: row.retentionStatus,
    reason:
      row.retentionReason ??
      "No GitHub work has been attached. Editing or viewing does not renew expiry.",
    createdAt,
    checkedAt: row.retentionCheckedAt,
    nextCheckAt: row.retentionNextCheckAt,
    inactiveSince: row.inactiveSince,
    expiresAt:
      row.expiresAt ??
      (row.everAttached
        ? null
        : new Date(Date.parse(createdAt) + RETENTION_MS).toISOString()),
  };
}

export function utcTimestamp(value: string): string {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}
