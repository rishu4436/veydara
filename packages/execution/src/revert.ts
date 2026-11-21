/** Decode revert data against the pinned Aave V4 / SafeERC20 error ABIs. Unknown selectors are shown raw, never guessed. */
import { BaseError, decodeErrorResult, type Hex } from "viem";
import { ALL_ERRORS_ABI } from "@veydara/protocols";

export interface DecodedRevert {
  name: string;
  args: string[];
  selector: string | null;
  raw: string | null;
  message: string;
}

export function revertData(err: unknown): Hex | null {
  if (err instanceof BaseError) {
    const found = err.walk((e) => typeof (e as { data?: unknown }).data === "string" && /^0x[0-9a-fA-F]*$/.test((e as { data: string }).data));
    const d = (found as { data?: string } | null)?.data;
    if (d) return d as Hex;
    const m = /(0x[0-9a-fA-F]{8,})/.exec(err.details ?? "");
    if (m) return m[1] as Hex;
  }
  const d = (err as { data?: unknown })?.data;
  return typeof d === "string" && d.startsWith("0x") ? (d as Hex) : null;
}

export function decodeRevert(err: unknown): DecodedRevert {
  const data = revertData(err);
  const short = err instanceof BaseError ? err.shortMessage : err instanceof Error ? err.message : String(err);
  return decodeRevertData(data, short);
}

export function decodeRevertData(data: Hex | null, fallbackMessage = "reverted"): DecodedRevert {
  if (!data || data === "0x") return { name: "Reverted (no revert data)", args: [], selector: null, raw: data, message: fallbackMessage };
  try {
    const d = decodeErrorResult({ abi: ALL_ERRORS_ABI, data });
    const args = (d.args ?? []).map((a) => String(a));
    return { name: d.errorName, args, selector: data.slice(0, 10), raw: data, message: `${d.errorName}(${args.join(", ")})` };
  } catch {
    return { name: "Unknown custom error", args: [], selector: data.slice(0, 10), raw: data, message: `Unrecognised revert selector ${data.slice(0, 10)} — not in the pinned error ABIs; shown raw.` };
  }
}
