export type PlanErrorCode =
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_PROVIDER_UNAVAILABLE"
  | "AUTH_UNKNOWN_IDENTITY"
  | "CONTRACT_UNSUPPORTED"
  | "REQUEST_INVALID"
  | "DUPLICATE_ID"
  | "REFERENCE_MISSING"
  | "REFERENCE_CYCLE"
  | "ASSET_UNAVAILABLE"
  | "ASSET_INVALID"
  | "ASSET_TOO_LARGE"
  | "STORAGE_LIMIT"
  | "SYNC_REQUIRED"
  | "PLAN_CONFLICT"
  | "OPERATION_MISMATCH"
  | "PLAN_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "CONTEXT_NOT_FOUND"
  | "GITHUB_NOT_CONFIGURED"
  | "GITHUB_ACCESS_DENIED"
  | "GITHUB_UNAVAILABLE"
  | "GITHUB_WORK_NOT_FOUND"
  | "PUBLICATION_NOT_ALLOWED";

export class PlanError extends Error {
  constructor(
    readonly code: PlanErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlanError";
  }
}
