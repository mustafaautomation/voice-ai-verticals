export type Screen =
  | { level: "advice"; code: "advice" }
  | { level: "danger"; code: "danger" }
  | { level: "custody"; code: "custody" }
  | { level: "referral"; code: "referral"; practice: string }
  | { level: "confidential"; code: "confidential" }
  | { level: "off_topic"; code: "off_topic" }
  | { level: "intake"; code: "intake"; practice: string };

const ADVICE = /\b(will I win|chances of winning|what should I do legally|is this illegal|predict|guaranteed|sue them and win|legal advice)\b/i;
const DANGER = /\b(domestic violence|he hit me|she hit me|afraid to go home|strangl\w*|threaten\w* to kill|in danger)\b/i;
const CUSTODY = /\b(in custody|in jail|arrested|holding cell|police station|bond)\b/i;
const INJECTION = /\bignore (?:your|all|previous|prior) instructions\b/i;
const OFF = /\b(joke|poem|football|stock tip)\b/i;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;

export function screenInquiry(text: string, role: "client" | "opposing" | "other" = "client"): Screen {
  if (SSN.test(text)) return { level: "confidential", code: "confidential" };
  if (INJECTION.test(text) || (OFF.test(text) && !DANGER.test(text) && !CUSTODY.test(text))) return { level: "off_topic", code: "off_topic" };
  if (DANGER.test(text)) return { level: "danger", code: "danger" };
  if (role === "opposing" || role === "other") return { level: "confidential", code: "confidential" };
  if (ADVICE.test(text)) return { level: "advice", code: "advice" };
  if (CUSTODY.test(text)) return { level: "custody", code: "custody" };
  if (/\bimmigrat\w*\b/i.test(text)) return { level: "referral", code: "referral", practice: "immigration" };
  if (/\bbankruptcy\b/i.test(text)) return { level: "referral", code: "referral", practice: "bankruptcy" };
  if (/\b(tax|irs)\b/i.test(text)) return { level: "referral", code: "referral", practice: "tax" };
  if (/\bpatent\b/i.test(text)) return { level: "referral", code: "referral", practice: "intellectual_property" };
  if (/\b(crash|injury|hurt|accident)\b/i.test(text)) return { level: "intake", code: "intake", practice: "personal_injury" };
  if (/\b(divorce|custody|child support)\b/i.test(text)) return { level: "intake", code: "intake", practice: "family" };
  if (/\b(fired|workplace|discrimination|wages)\b/i.test(text)) return { level: "intake", code: "intake", practice: "employment" };
  if (/\b(will|trust|estate|probate)\b/i.test(text)) return { level: "intake", code: "intake", practice: "estate" };
  if (/\b(criminal|charge|arrest|dui)\b/i.test(text)) return { level: "intake", code: "intake", practice: "criminal" };
  return { level: "intake", code: "intake", practice: "personal_injury" };
}

export function adviceScript(): string {
  return "I can't give legal advice or predict an outcome. Talking to me does not create an attorney-client relationship. I can take an intake and offer a consult with a Quillmere lawyer.";
}

export function dangerScript(): string {
  return `If you are in danger, call 911 now. You can also call the National Domestic Violence Hotline at ${"800-799-7233"}. I will not book a routine consult over a safety emergency, and this demo does not create a lawyer-client relationship.`;
}

export function custodyScript(): string {
  return "If you are in custody, I will page the on-call criminal-defense attorney. I can't advise you about what to say to police. Don't discuss facts of the case on this recorded demo line.";
}

export function referralScript(practice: string): string {
  return `Quillmere doesn't handle ${practice.replaceAll("_", " ")} matters. I can refer you to look for a lawyer who does. I can't recommend a specific outcome or a specific outside lawyer in this demo.`;
}

export function redactSsn(text: string): string {
  return text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "•••-••-••••").replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, "**/**/****");
}
