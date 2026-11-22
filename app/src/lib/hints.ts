/**
 * Hints for commonly confused letter pairs (Practice mode).
 * Wording is deliberately general. Have the FSL consultant review it (docs/decisions.md G1, G11).
 */

const PAIR_HINTS: Record<string, string> = {
  'A|E':
    'Check your thumb: in one it rests beside the fist, in the other it tucks under the curled fingers.',
  'A|S': 'Check your thumb: alongside the fist, or across the front of the fingers?',
  'A|T': 'Check where the thumb sits relative to the index finger.',
  'E|S':
    'Check whether the fingertips curl down onto the thumb or the thumb wraps over the fingers.',
  'M|N': 'Count the fingers draped over the thumb.',
  'M|T': 'Check which fingers cover the thumb.',
  'N|T': 'Check which fingers cover the thumb.',
  'S|T': 'Check whether the thumb is across the front of the fingers or between them.',
  'K|V': 'Check where the thumb touches. Keep the two raised fingers spread.',
  'R|U': 'Crossed fingers or side by side? Look at the index and middle fingers.',
  'U|V': 'Are the two raised fingers together or spread apart?',
  'G|H': 'Count how many fingers point sideways.',
  'D|F': 'Check which finger stays up and which ones touch the thumb.',
  'O|C': 'Close the circle fully, or leave a gap?',
  'K|P': 'Same shape, different direction. Check which way your hand is pointing.',
  'G|Q': 'Same shape, different direction. Check which way your hand is pointing.',
  'I|Y': 'Is the thumb tucked in, or stretched out?',
  'B|E': 'Fingers straight up, or curled down?',
  'W|F': 'Count the raised fingers and check what the thumb touches.',
  'X|D': 'Is the index finger hooked or straight?',
};

export function hintFor(target: string, seen: string): string {
  const tip = PAIR_HINTS[`${target}|${seen}`] ?? PAIR_HINTS[`${seen}|${target}`];
  const base = `Looks like ${seen}.`;
  return tip ? `${base} ${tip}` : `${base} Compare your hand with the reference for ${target}.`;
}
