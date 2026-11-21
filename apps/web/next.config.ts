import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@veydara/domain", "@veydara/cmc", "@veydara/chains", "@veydara/quant", "@veydara/protocols", "@veydara/execution"],
  turbopack: { root: path.join(import.meta.dirname, "../..") },
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  images: { remotePatterns: [{ protocol: "https", hostname: "s2.coinmarketcap.com" }] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
