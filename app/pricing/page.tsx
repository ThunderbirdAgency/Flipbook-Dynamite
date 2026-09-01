import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export const metadata = {
  title: "Pricing — Flipbook Dynamite",
  description:
    "Straightforward plans for turning PDFs into interactive, brandable flipbooks. Free to start; upgrade for video layers, branding, analytics, and white-label.",
};

interface Plan {
  id: string;
  name: string;
  price: number;
  cadence: string;
  tagline: string;
  featured?: boolean;
  cta: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    cadence: "forever",
    tagline: "Kick the tires.",
    cta: "Start free",
    features: [
      "1 published flipbook",
      "3D page-flip viewer",
      "Shareable link + iframe embed",
      "Full-text search",
      "Flipbook Dynamite badge",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 29,
    cadence: "/mo",
    tagline: "For the occasional flipbook.",
    cta: "Choose Starter",
    features: [
      "10 flipbooks",
      "Custom background, logo & accent",
      "SEO title & social preview card",
      "QR code + social sharing",
      "Password protection",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 79,
    cadence: "/mo",
    tagline: "Video, branding & analytics.",
    featured: true,
    cta: "Choose Professional",
    features: [
      "Unlimited flipbooks",
      "Video / GIF / iframe interactive layers",
      "Drag-to-place layer editor",
      "View & page-reach analytics",
      "Private books + everything in Starter",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 179,
    cadence: "/mo",
    tagline: "White-label & unlimited.",
    cta: "Choose Business",
    features: [
      "Remove Flipbook Dynamite branding",
      "Custom domain",
      "Team seats",
      "Priority support",
      "Everything in Professional",
    ],
  },
];

const FAQ = [
  {
    q: "Do people need an account to view a flipbook?",
    a: "No. Every book has a public link and an iframe embed. Only creators sign in.",
  },
  {
    q: "Can I use my own branding?",
    a: "Yes — background, logo, accent color, and SEO per book on Starter and up; remove our badge entirely on Business.",
  },
  {
    q: "What can I put on a page?",
    a: "Video pop-ups (YouTube/Vimeo/MP4), movable GIF/image layers, links, and iframe embeds — placed with a drag-to-place editor (Professional and up).",
  },
  {
    q: "Can I change plans later?",
    a: "Anytime. Upgrade or downgrade whenever; your published books keep working.",
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader active="pricing" />

      <section className="mx-auto w-full max-w-6xl px-6 pt-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Pricing that won&apos;t blow up your budget
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
          Start free. Upgrade when you want video layers, your own brand, and analytics. No
          per-view fees — ever.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-6 py-14 lg:grid-cols-4">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              p.featured
                ? "border-amber-400/50 bg-amber-400/[0.06] shadow-[0_0_40px_-12px_rgba(251,146,60,0.5)]"
                : "border-white/10 bg-slate-900/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{p.name}</h2>
              {p.featured && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                  POPULAR
                </span>
              )}
            </div>
            <p className="mt-4 text-4xl font-extrabold text-white">
              ${p.price}
              <span className="text-sm font-normal text-slate-500">{p.cadence}</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">{p.tagline}</p>

            <Link
              href={p.id === "free" ? "/app" : `/api/checkout?plan=${p.id}`}
              className={`mt-5 block rounded-full px-4 py-2.5 text-center text-sm font-semibold transition ${
                p.featured
                  ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                  : "border border-white/15 text-white hover:bg-white/5"
              }`}
            >
              {p.cta}
            </Link>

            <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <svg
                    className="mt-0.5 shrink-0 text-amber-400"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 pb-24">
        <h2 className="text-center text-2xl font-bold tracking-tight">Questions, answered</h2>
        <div className="mt-8 divide-y divide-white/5 rounded-2xl border border-white/10 bg-slate-900/40">
          {FAQ.map((item) => (
            <div key={item.q} className="p-6">
              <h3 className="font-semibold text-white">{item.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
