const REACTION = /\b(can't breathe|cannot breathe|epi[\s-]?pen|epipen|anaphyla\w*|throat is closing)\b/i;
const PROMISE = /\b(guaranteed|is it safe|is this safe|allergen-free|100% safe)\b/i;
const INJECTION = /\bignore (?:your|all|previous|prior) instructions\b/i;
const OFF = /\b(joke|poem|football|stock tip)\b/i;

export function reactionNow(text: string): boolean {
  return REACTION.test(text);
}

export function wantsGuarantee(text: string): boolean {
  return PROMISE.test(text);
}

export function offTopic(text: string): boolean {
  return INJECTION.test(text) || OFF.test(text);
}

export function allergensIn(note: string): string[] {
  const found = new Set<string>();
  const text = note.toLowerCase();
  for (const name of ["gluten", "wheat", "egg", "dairy", "milk", "fish", "shellfish", "peanut", "sesame", "soy"]) {
    if (text.includes(name)) found.add(name === "wheat" ? "gluten" : name === "milk" ? "dairy" : name);
  }
  return [...found];
}

export function reactionScript(): string {
  return "If this is a reaction now, call 911. I will not take a food order over a medical emergency, and I can't say any dish is safe.";
}

export function promiseScript(): string {
  return "I can't say a dish is safe or allergen-free. The kitchen is not a sealed room. A manager can talk it through, and this demo still does not promise a plate.";
}
