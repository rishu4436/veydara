export type VeydaraErrorCode =
  | "CMC_KEY_MISSING"
  | "CMC_PLAN_EXPIRED"
  | "CMC_PLAN_FORBIDDEN"
  | "CMC_RATE_LIMITED"
  | "CMC_CREDITS_EXHAUSTED"
  | "CMC_BAD_REQUEST"
  | "CMC_UPSTREAM"
  | "CMC_SCHEMA_MISMATCH"
  | "CIRCUIT_OPEN"
  | "RPC_UNAVAILABLE"
  | "INVALID_ADDRESS"
  | "UNSUPPORTED_CHAIN"
  | "INSUFFICIENT_DATA";

export class VeydaraError extends Error {
  constructor(
    public readonly code: VeydaraErrorCode,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VeydaraError";
  }
}
