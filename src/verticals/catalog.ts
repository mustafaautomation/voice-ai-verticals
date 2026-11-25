export type VerticalListing = {
  id: string;
  name: string;
  industry: string;
  status: "live" | "coming_soon";
  summary: string;
  planned: string;
};

export const CATALOG: VerticalListing[] = [
  {
    id: "hvac",
    name: "HVAC & home services",
    industry: "Home services",
    status: "live",
    summary: "After-hours dispatcher for a fictional Duluth heating and cooling company. Emergency triage, arrival windows, tech text, missed-call text-back.",
    planned: "Live in this repo.",
  },
  {
    id: "clinic",
    name: "Medical clinic",
    industry: "Healthcare front desk",
    status: "coming_soon",
    summary: "Hours, new-patient booking, and a hard stop on clinical advice.",
    planned: "Same tool contract as the Brightside Dental demo at voice.quvantic.com, folded in as a vertical config.",
  },
  {
    id: "fintech",
    name: "Fintech support & collections",
    industry: "Financial services",
    status: "coming_soon",
    summary: "Hardship, promise-to-pay, and dispute intake. The demo stores no card numbers.",
    planned: "Identity check with a fake last-4, then a scripted hardship or dispute path.",
  },
  {
    id: "legal",
    name: "Legal intake",
    industry: "Law firm front desk",
    status: "coming_soon",
    summary: "Conflict check and consult booking. The agent does not give legal advice.",
    planned: "Matter type, conflict questions, and a consult window.",
  },
  {
    id: "restaurant",
    name: "Restaurant",
    industry: "Hospitality",
    status: "coming_soon",
    summary: "Reservation desk for party size, time, and allergy notes.",
    planned: "Table inventory and a large-party transfer.",
  },
  {
    id: "property",
    name: "Property management",
    industry: "Residential operations",
    status: "coming_soon",
    summary: "After-hours maintenance: active leak versus a routine work order.",
    planned: "Vendor dispatch for emergencies, next-day windows for the rest.",
  },
];
