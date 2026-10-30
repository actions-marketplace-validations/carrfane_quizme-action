/**
 * Decides what a quiz asks about, before the model is involved.
 *
 * Left to itself the model drifts to code trivia ("which Node version does the
 * job request?"). Planning the angle of every question in code, then rejecting
 * a quiz that ignores the plan, keeps questions at the level of what the change
 * does to the system.
 */

/** Angle key -> label shown in the comment. Keys are what the model echoes. */
export const ANGLES = {
  intent: 'Intent',
  behavior: 'Behavior',
  side_effects: 'Side effects',
  rationale: 'Rationale',
};

const WITH_INTENT = ['intent', 'behavior', 'side_effects', 'rationale'];
// Intent cannot be checked with nothing to check it against.
const WITHOUT_INTENT = ['rationale', 'behavior', 'side_effects'];

export const MAX_DESCRIPTION_CHARS = 4000;
/** Below this, a body is too thin to check the code against. */
export const MIN_INTENT_CHARS = 40;

export function planSlots(count, hasIntent) {
  const cycle = hasIntent ? WITH_INTENT : WITHOUT_INTENT;
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}

/**
 * PR templates leave HTML comments behind, and an untouched template should
 * not pass for a description. An unfilled template whose headings survive will
 * still count; parsing templates is not worth it.
 *
 * @returns {{text: string, hasIntent: boolean}}
 */
export function cleanDescription(body) {
  if (typeof body !== 'string') return { text: '', hasIntent: false };

  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const hasIntent = cleaned.length >= MIN_INTENT_CHARS;
  const text =
    cleaned.length > MAX_DESCRIPTION_CHARS
      ? `${cleaned.slice(0, MAX_DESCRIPTION_CHARS)}\n\n[... description truncated ...]`
      : cleaned;

  return { text, hasIntent };
}

/** "Side effects", "side-effects" and "behaviour" all mean a known key. */
export function normaliseAngle(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return key === 'behaviour' ? 'behavior' : key;
}
