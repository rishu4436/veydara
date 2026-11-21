/** Stage 1 — validate. A typed, zod-checked execution intent. */
import { z } from "zod";
import { getAddress, type Address } from "viem";

const Amount = z
  .string()
  .regex(/^[0-9]{1,40}$/, "amount must be a base-unit integer string")
  .refine((v) => /^[0-9]+$/.test(v) && BigInt(v) > 0n, "amount must be > 0");
const ReserveId = z.number().int().min(0).max(255);

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("supply"), reserveId: ReserveId, amount: Amount }),
  z.object({ kind: z.literal("enableCollateral"), reserveId: ReserveId }),
  z.object({ kind: z.literal("borrow"), reserveId: ReserveId, amount: Amount }),
  z.object({ kind: z.literal("repay"), reserveId: ReserveId, amount: Amount }),
  z.object({ kind: z.literal("withdraw"), reserveId: ReserveId, amount: Amount }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const IntentSchema = z.object({
  account: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "account must be an address"),
  actions: z.array(ActionSchema).min(1).max(8),
  label: z.string().max(120).optional(),
  source: z.enum(["manual", "lifecycle-preset", "solver-arena", "intent-engine", "revert-drill"]).default("manual"),
  /** Who signs on the fork: a server-held anvil test key, or the user's own injected wallet (SIWE-proven, chain 31337 only). */
  signer: z.enum(["anvil-test-account", "wallet"]).default("anvil-test-account"),
});
export type Intent = z.infer<typeof IntentSchema> & { account: Address };

export interface ValidationResult {
  ok: boolean;
  intent: Intent | null;
  errors: string[];
}

/**
 * signer "anvil-test-account": only this fork's anvil-generated accounts.
 * signer "wallet": only wallets the signed-in user proved with SIWE (the wallet itself signs, on chain 31337).
 * Reserve ids must exist on the Spoke.
 */
export function validateIntent(raw: unknown, ctx: { testAccounts: readonly string[]; ownedWallets?: readonly string[]; reserveCount: number }): ValidationResult {
  const parsed = IntentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, intent: null, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "intent"}: ${i.message}`) };
  const errors: string[] = [];
  const account = getAddress(parsed.data.account);
  if (parsed.data.signer === "wallet") {
    if (!(ctx.ownedWallets ?? []).some((a) => getAddress(a) === account)) errors.push(`account ${account} is not a wallet you proved ownership of with Sign-In with Ethereum; sign in and link it first.`);
  } else if (!ctx.testAccounts.some((a) => getAddress(a) === account)) errors.push(`account ${account} is not one of this fork's anvil-generated test accounts; VEYDARA never holds keys for real wallets.`);
  parsed.data.actions.forEach((a, i) => {
    if (a.reserveId >= ctx.reserveCount) errors.push(`actions.${i}: reserve ${a.reserveId} is not listed on the Spoke (count ${ctx.reserveCount}).`);
  });
  return { ok: errors.length === 0, intent: errors.length ? null : { ...parsed.data, account }, errors };
}
