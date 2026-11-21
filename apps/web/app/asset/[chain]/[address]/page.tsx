import { AssetStage } from "@/components/asset-stage";

export default async function AssetPage({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  return <AssetStage chain={chain} address={decodeURIComponent(address)} />;
}
