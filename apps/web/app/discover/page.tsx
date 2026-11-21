import Link from "next/link";
import { BASE_TOKENS } from "@veydara/chains";
import { aaveListingFor } from "@veydara/protocols";
import { PageHeader } from "@/components/page-header";
import { RwaLookup } from "@/components/rwa-lookup";

export default function DiscoverPage() {
  const equities = BASE_TOKENS.filter((t) => t.assetClass === "tokenized-equity");
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Discover" title="Tokenized equities, resolved by contract." sub="Every row below is an exact Base contract verified against the official Aave address book and on-chain metadata. Open one to see its Collateral Passport: issuer, underlying, distinct price sources, protocol oracle and explicit unknowns." />
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <caption className="sr-only">Verified Coinbase tokenized equities on Base</caption>
          <thead className="border-b border-line text-[11px] uppercase tracking-wider text-faint">
            <tr>
              <th className="px-5 py-3 font-medium">Token</th>
              <th className="px-5 py-3 font-medium">Underlying</th>
              <th className="px-5 py-3 font-medium">Issuer</th>
              <th className="px-5 py-3 font-medium">Contract (Base)</th>
              <th className="px-5 py-3 font-medium">Lending listing</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {equities.map((t) => (
              <tr key={t.address} className="hover:bg-raised/60">
                <td className="px-5 py-3 font-display text-[17px]">{t.symbol}</td>
                <td className="px-5 py-3 text-muted">{t.underlying?.name} <span className="text-faint">({t.underlying?.symbol})</span></td>
                <td className="px-5 py-3 text-muted">{t.issuer}</td>
                <td className="px-5 py-3 font-mono text-[11.5px] text-faint">{t.address.slice(0, 10)}…{t.address.slice(-6)}</td>
                <td className="px-5 py-3">{aaveListingFor(t.address) ? <span className="text-[11.5px] text-violet">Aave V4 MAG7 spoke · eligibility unverified</span> : <span className="text-[11.5px] text-faint">none verified</span>}</td>
                <td className="px-5 py-3 text-right"><Link href={`/asset/base/${t.address}`} className="text-ice">Passport →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <RwaLookup />
      <p className="text-[11.5px] text-faint">Other issuers&apos; tokens for the same company (e.g. xStocks NVDAX, Ondo NVDAon) are separate instruments with their own contracts and rights; they are never assumed to be accepted where NVDAc is.</p>
    </div>
  );
}
