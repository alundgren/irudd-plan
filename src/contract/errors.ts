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
  | "PLAN_CONFLICT"
  | "OPERATION_MISMATCH"
  | "PLAN_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "CONTEXT_NOT_FOUND";

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
