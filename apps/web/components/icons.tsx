import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const I = {
  overview: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8.5" opacity=".5" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" /></svg>),
  discover: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>),
  alpha: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 19V5M4 19h16" /><path d="m7 15 4-5 3 3 5-7" /></svg>),
  strategies: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M8 7.2 10.8 16M16 7.2 13.2 16M8.2 6h7.6" /></svg>),
  positions: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M3.5 10h17M8 15h3" /></svg>),
  futures: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 12h4l2-6 3 12 2-6h7" /></svg>),
  guardian: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3 4.5 6v5.5c0 4.3 3.1 8 7.5 9.5 4.4-1.5 7.5-5.2 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></svg>),
  proof: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" /><path d="M14 3.5V8h4M10 13h5M10 16.5h5" /></svg>),
  fork: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v2a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7M12 13v4" /></svg>),
  wallet: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="6" width="17" height="13" rx="2.5" /><path d="M16 12.5h2M3.5 9.5h17" /></svg>),
  bell: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>),
  eye: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>),
  chevron: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>),
  panel: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9 4.5v15" /></svg>),
  ext: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" /></svg>),
  shield: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3 4.5 6v5.5c0 4.3 3.1 8 7.5 9.5 4.4-1.5 7.5-5.2 7.5-9.5V6z" /></svg>),
  sun: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>),
};
