export type VerticalListing = {
  id: string;
  name: string;
  industry: string;
  status: "live" | "coming_soon";
  summary: string;
  planned: string;
  href?: string;
  cta?: string;
};

export const CATALOG: VerticalListing[] = [
  {
    id: "hvac",
    name: "HVAC & home services",
    industry: "Home services",
    status: "live",
    summary: "After-hours dispatcher for a fictional Duluth heating and cooling company. Emergency triage, arrival windows, tech text, missed-call text-back.",
    planned: "Live in this repo.",
    href: "/v/hvac",
    cta: "Open the HVAC demo",
  },
  {
    id: "clinic",
    name: "Medical clinic",
    industry: "Primary and urgent care",
    status: "live",
    summary: "Fictional Madison front desk. Identity check, 911 and 988 routing, visits, refills. No diagnosis and no real PHI.",
    planned: "Live in this repo.",
    href: "/v/clinic",
    cta: "Open the clinic demo",
  },
  {
    id: "fintech",
    name: "Fintech support & collections",
    industry: "Card support",
    status: "live",
    summary: "Fictional Wrenline card desk. Last-four verification, disputes, freezes, and FDCPA-minded collections. No real payments.",
    planned: "Live in this repo.",
    href: "/v/fintech",
    cta: "Open the Wrenline demo",
  },
  {
    id: "legal",
    name: "Legal intake",
    industry: "Law firm front desk",
    status: "live",
    summary: "Fictional Quillmere intake in Denver. Conflicts, consults, and safety routing. No legal advice.",
    planned: "Live in this repo.",
    href: "/v/legal",
    cta: "Open the legal demo",
  },
  {
    id: "restaurant",
    name: "Restaurant",
    industry: "Hospitality",
    status: "live",
    summary: "Fictional Larkglass bistro in Portland. Orders, reservations, kitchen tickets, and allergy notes. Nothing is charged.",
    planned: "Live in this repo.",
    href: "/v/restaurant",
    cta: "Open the restaurant demo",
  },
  {
    id: "property",
    name: "Property management",
    industry: "Residential operations",
    status: "live",
    summary: "Fictional Bramblefen desk in Providence. Gas to 911, emergency tickets, tours, and a portal that does not take rent.",
    planned: "Live in this repo.",
    href: "/v/property",
    cta: "Open the property demo",
  },
];
