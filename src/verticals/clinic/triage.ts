export type TriageLevel = "emergency" | "crisis" | "urgent" | "routine" | "off_topic" | "needs_detail";
export type TriageChannel = "911" | "988" | "nurse" | "book" | "decline" | "ask";

export type TriageResult = {
  ok: true;
  level: TriageLevel;
  channel: TriageChannel;
  safety: boolean;
  callerScript: string;
};

export const EMERGENCY_911 =
  "This can be an emergency. Call 911 now or go to the nearest emergency room. Do not drive yourself if you feel faint or cannot breathe. I will not book a visit and I cannot diagnose this. If you are also in emotional crisis, call or text 988.";

export const CRISIS_988 =
  "If you are thinking about suicide, call or text 988 now. If you are in immediate danger, call 911. I will not book a visit, and I will not ask you to describe a plan. You can also stay on the line and I can transfer you only after you have 988 or 911.";

const CRISIS = /\b(suicid\w*|kill myself|want to die|end my life|don't want to live|do not want to live)\b/i;
const CHEST = /\b(chest pain|chest pressure|heart attack|pain in my chest|crushing pain)\b/i;
const STROKE = /\b(stroke|face (?:is )?droop\w*|arm weakness|slurred speech|can't speak|cannot speak|one side of (?:my )?face)\b/i;
const BREATH = /\b(can't breathe|cannot breathe|severe shortness|gasping|turning blue|trouble breathing)\b/i;
const ANAPHYLAXIS = /\b(anaphyla\w*|throat (?:is )?clos\w*|throat swelling|used my epi|epipen|allergic reaction.{0,40}breathe)\b/i;
const URGENT = /\b(fever|ear ?ache|ear pain|sore throat|urin\w*|burning when I pee|rash|vomit\w*|cough|sinus|pink eye|sick visit)\b/i;
const ROUTINE = /\b(physical|follow[- ]?up|check[- ]?up|annual|well visit|establish care|new patient|refill|medication|telehealth|video visit)\b/i;
const ABUSE = /\b(ignore (?:all |any )?(?:your |previous |prior )?instructions|system prompt|social security|\bssn\b|credit card|password)\b/i;
const OFF_TOPIC = /\b(joke|poem|football|stock tip|weather forecast|who won|recipe)\b/i;

export function triageSymptoms(description: string): TriageResult {
  const text = description;
  const emergency = CHEST.test(text) || STROKE.test(text) || BREATH.test(text) || ANAPHYLAXIS.test(text);
  const crisis = CRISIS.test(text);
  if (emergency) {
    return { ok: true, level: "emergency", channel: "911", safety: true, callerScript: EMERGENCY_911 };
  }
  if (crisis) {
    return { ok: true, level: "crisis", channel: "988", safety: true, callerScript: CRISIS_988 };
  }
  const clinical = URGENT.test(text) || ROUTINE.test(text);
  if ((ABUSE.test(text) || OFF_TOPIC.test(text)) && !clinical) {
    return {
      ok: true,
      level: "off_topic",
      channel: "decline",
      safety: false,
      callerScript:
        "I only help with Lindenmere scheduling, refill requests, and routing emergencies. I can't do that, and I won't read a chart or take payment details.",
    };
  }
  if (URGENT.test(text)) {
    return {
      ok: true,
      level: "urgent",
      channel: "nurse",
      safety: false,
      callerScript:
        "This sounds like it needs a same-day sick visit or the triage nurse. I can't say what it is. I can book the next sick slot or transfer you to the nurse line.",
    };
  }
  if (ROUTINE.test(text)) {
    return {
      ok: true,
      level: "routine",
      channel: "book",
      safety: false,
      callerScript: "This can be scheduled. I need to verify name and date of birth before I discuss any existing visit.",
    };
  }
  return {
    ok: true,
    level: "needs_detail",
    channel: "ask",
    safety: false,
    callerScript:
      "Ask one question: is this chest pain, trouble breathing, a sick visit, a refill, or a routine checkup? Do not guess a diagnosis.",
  };
}
