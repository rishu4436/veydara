import { I } from "./icons";

export const NAV = [
  { href: "/", label: "Overview", icon: I.overview, short: "Home" },
  { href: "/discover", label: "Discover", icon: I.discover, short: "Discover" },
  { href: "/alpha", label: "Alpha", icon: I.alpha, short: "Alpha" },
  { href: "/strategies", label: "Strategies", icon: I.strategies, short: "Execute" },
  { href: "/fork", label: "Fork Lab", icon: I.fork, short: "Fork" },
  { href: "/positions", label: "Positions", icon: I.positions, short: "Positions" },
  { href: "/futures", label: "Parallel Futures", icon: I.futures, short: "Futures" },
  { href: "/guardian", label: "Guardian", icon: I.guardian, short: "Guardian" },
  { href: "/proof", label: "Proof Center", icon: I.proof, short: "Proof" },
] as const;
