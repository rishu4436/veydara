"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { authFetch } from "./auth-fetch";

export interface SessionView {
  authenticated: boolean;
  userId?: string;
  expiresAt?: string;
  wallets?: { address: string; chainId: number; verifiedVia: string; linkedAt: string }[];
  store: { kind: "postgres" | "json"; durable: boolean; detail: string };
}

export function useSession() {
  return useQuery({ queryKey: ["session"], queryFn: () => authFetch<SessionView>("/api/auth/session"), staleTime: 30_000 });
}

/** Sign-In with Ethereum (EIP-4361). link=true adds the connected wallet to the signed-in account. */
export function useSiwe() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["session"] });
  const signIn = useMutation({
    mutationFn: async (link: boolean) => {
      if (!address) throw new Error("Connect a wallet first.");
      const n = await authFetch<{ nonce: string; statement: string; domain: string; uri: string; chainIds: number[] }>("/api/auth/nonce");
      const cid = chainId && n.chainIds.includes(chainId) ? chainId : 8453;
      const message = createSiweMessage({ address, chainId: cid, domain: n.domain, uri: n.uri, nonce: n.nonce, version: "1", statement: n.statement, issuedAt: new Date(), expirationTime: new Date(Date.now() + 10 * 60_000) });
      const signature = await signMessageAsync({ message, account: address });
      return authFetch<{ ok: boolean }>("/api/auth/verify", { body: { message, signature, link } });
    },
    onSuccess: done,
  });
  const logout = useMutation({ mutationFn: () => authFetch("/api/auth/logout", { body: {} }), onSuccess: done });
  const unlink = useMutation({ mutationFn: (a: string) => authFetch("/api/auth/unlink", { body: { address: a } }), onSuccess: done });
  return { address, chainId, signIn, logout, unlink };
}
