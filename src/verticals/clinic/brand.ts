export const CLINIC_ID = "clinic";

export const CLINIC = {
  id: CLINIC_ID,
  name: "Lindenmere Primary Care",
  city: "Madison, Wisconsin",
  address: "440 Quill Orchard Lane, Madison, WI 53703",
  addressNote: "Quill Orchard Lane is not a real street.",
  phoneDisplay: "(608) 555-0174",
  phoneE164: "+16085550174",
  nurseDisplay: "(608) 555-0166",
  nurseE164: "+16085550166",
  timezone: "America/Chicago",
  tzLabel: "CT",
  serviceArea: ["Madison", "Monona", "Middleton", "Fitchburg", "the east side and downtown"],
  hours: [
    "Desk: Monday–Friday 8:00 AM–5:00 PM CT",
    "Saturday sick and telehealth visits: 8:00 AM–12:00 PM CT",
    "Sunday: desk closed",
    "After hours: this agent answers. It does not give medical advice.",
  ],
  disclaimer:
    "Portfolio demo. Lindenmere Primary Care is fictional. There is no real clinic, no real patient, and no real PHI. Do not share a real name, date of birth, or insurance number. A medical emergency is 911. If you are thinking about suicide, call or text 988.",
};

export const VISIT_TYPES = ["new_patient", "follow_up", "sick", "annual", "telehealth"] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_LABELS: Record<VisitType, string> = {
  new_patient: "New patient",
  follow_up: "Follow-up",
  sick: "Sick visit",
  annual: "Annual physical",
  telehealth: "Telehealth",
};

export const VISIT_MINUTES: Record<VisitType, number> = {
  new_patient: 40,
  follow_up: 20,
  sick: 20,
  annual: 40,
  telehealth: 20,
};

export type ProviderDef = {
  id: string;
  name: string;
  credential: string;
  focus: string;
  phone: string;
  weekdays: number[];
  openMin: number;
  closeMin: number;
  saturdayCloseMin?: number;
  visitTypes: VisitType[];
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "prov_solano",
    name: "Dr. Amira Solano",
    credential: "MD",
    focus: "Family medicine",
    phone: "+16085550111",
    weekdays: [1, 2, 3, 4],
    openMin: 8 * 60,
    closeMin: 17 * 60,
    visitTypes: ["new_patient", "follow_up", "annual", "telehealth"],
  },
  {
    id: "prov_pell",
    name: "Dr. Jonah Pell",
    credential: "DO",
    focus: "Primary and urgent care",
    phone: "+16085550112",
    weekdays: [2, 3, 4, 5],
    openMin: 8 * 60,
    closeMin: 17 * 60,
    visitTypes: ["sick", "follow_up", "telehealth"],
  },
  {
    id: "prov_cho",
    name: "Lena Cho, NP",
    credential: "FNP",
    focus: "Sick visits and telehealth",
    phone: "+16085550113",
    weekdays: [1, 2, 3, 4, 5, 6],
    openMin: 8 * 60,
    closeMin: 17 * 60,
    saturdayCloseMin: 12 * 60,
    visitTypes: ["sick", "follow_up", "telehealth"],
  },
];

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function visitLabel(id: string): string {
  return VISIT_LABELS[id as VisitType] ?? id;
}
