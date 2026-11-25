import { DateTime } from "luxon";

export const RESTAURANT_ID = "restaurant";

export const HOUSE = {
  id: RESTAURANT_ID,
  name: "Larkglass",
  city: "Portland, Maine",
  address: "18 Lantern Hold, Portland, ME 04101",
  addressNote: "Lantern Hold is not a real street. Larkglass is not a real restaurant.",
  phoneDisplay: "(207) 555-0164",
  phoneE164: "+12075550164",
  managerDisplay: "(207) 555-0190",
  managerE164: "+12075550190",
  timezone: "America/New_York",
  tzLabel: "ET",
  hours: [
    "Phone desk: Tuesday–Saturday 4:00–9:00 PM ET",
    "Dinner seating: 5:00–8:30 PM ET, every half hour",
    "Sunday and Monday: closed",
  ],
  disclaimer:
    "Portfolio demo. Larkglass is fictional. Nothing is charged, nothing is delivered, and the kitchen cannot promise an allergen-free plate. If someone is having a reaction now, call 911.",
};

export type MenuItem = {
  sku: string;
  name: string;
  detail: string;
  cents: number;
  allergens: string[];
  modifiers: Record<string, { label: string; cents: number }>;
};

export const MENU: MenuItem[] = [
  {
    sku: "farro",
    name: "Cider chicken",
    detail: "Roast chicken, farro, cider glaze",
    cents: 2400,
    allergens: ["gluten"],
    modifiers: { no_glaze: { label: "Glaze on the side", cents: 0 }, extra_farro: { label: "Extra farro", cents: 200 } },
  },
  {
    sku: "pappardelle",
    name: "Mushroom pappardelle",
    detail: "Egg pasta, browned mushrooms, thyme",
    cents: 2600,
    allergens: ["gluten", "egg"],
    modifiers: { gf_pasta: { label: "Rice-pasta swap", cents: 300 } },
  },
  {
    sku: "steelhead",
    name: "Steelhead",
    detail: "Pan-roasted steelhead, brown butter",
    cents: 3200,
    allergens: ["fish", "dairy"],
    modifiers: { no_butter: { label: "No brown butter", cents: 0 } },
  },
  {
    sku: "gem",
    name: "Little gem",
    detail: "Little gem, citrus, buttermilk dressing",
    cents: 1400,
    allergens: ["dairy"],
    modifiers: { dressing_side: { label: "Dressing on the side", cents: 0 } },
  },
  {
    sku: "cake",
    name: "Olive oil cake",
    detail: "Olive oil cake, citrus peel",
    cents: 1100,
    allergens: ["gluten", "egg"],
    modifiers: {},
  },
  {
    sku: "spritz",
    name: "House spritz",
    detail: "Citrus spritz, no alcohol in this demo",
    cents: 800,
    allergens: [],
    modifiers: {},
  },
];

export const DELIVERY_FEE_CENTS = 400;
export const TAX_RATE = 0.08;
export const DEUCES = 6;
export const FOURS = 4;

export function itemBySku(sku: string): MenuItem | undefined {
  return MENU.find((item) => item.sku === sku);
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function isDeskOpen(now: Date): boolean {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(HOUSE.timezone);
  const minutes = local.hour * 60 + local.minute;
  return local.weekday >= 2 && local.weekday <= 6 && minutes >= 16 * 60 && minutes < 21 * 60;
}

export function tablesFor(party: number): { deuce: number; four: number } | null {
  if (party < 1 || party > 8) return null;
  if (party <= 2) return { deuce: 1, four: 0 };
  if (party <= 4) return { deuce: 0, four: 1 };
  if (party <= 6) return { deuce: 1, four: 1 };
  return { deuce: 0, four: 2 };
}
