// Replaces every known spelling/transcription variant of the user's name with a
// neutral alias before text is sent to the LLM.  The raw transcript stored in
// the DB is never modified — only the string going to OpenAI is anonymised.

export const NAME_ALIAS = 'Alex'

// ── Multi-word phrases — replaced first so we don't break them with partial hits ──
// Sorted longest → shortest so the most specific patterns win.
const MULTI_WORD_PHRASES = [
  // Full name combos
  'Mohamed Sharuk', 'Mohammed Sharuk', 'Mohammad Sharuk', 'Muhammad Sharuk',
  'Muhammed Sharuk', 'Muhamad Sharuk', 'Mohamad Sharuk',
  'Mohd Sharuk', 'Md Sharuk', 'Mo Sharuk', 'Moh Sharuk',
  'Mohamed Shahrukh', 'Mohammed Shah Rukh', 'Muhammad Shahrook',
  'Mohamed Shahrook', 'Mohammed Sharukh', 'Mohammad Shahrukh',
  // Sharuk multi-word spellings
  'Shah Rukh', 'Shah Ruk', 'Sha Rukh', 'Sha Ruk',
  'Shah Rock', 'Sha Rock', 'Share Rock', 'Share Rook',
  'Shy Rook', 'Sure Rook', 'Show Rook', 'Shaw Rook',
  'Shah Rook', 'Sha Rook', 'Sha Rooke', 'Shah Rooke',
].sort((a, b) => b.length - a.length)

// ── Single-word variants (matched with \b word boundaries) ──
const SINGLE_WORD_VARIANTS = [
  // Sharuk direct spellings
  'Sharuk', 'Sharukh', 'Sharook', 'Sharouk', 'Sharooq', 'Sharuq',
  'Sharoukh', 'Sharookh', 'Shahruk', 'Shahrukh', 'Shahrook',
  'Shahrukhh', 'Shahrokh', 'Shahrok', 'Sharak', 'Sharock',
  'Sharoc', 'Sharruk', 'Sharrukh',
  // Speech-to-text / accent variations
  'Sheruk', 'Sherukh', 'Sherook', 'Sherok', 'Shoruk', 'Shorukh',
  'Shorook', 'Shorok', 'Shuruk', 'Shurukh', 'Shurook', 'Shurak',
  'Sharek', 'Sharekh', 'Shareuk', 'Sharik', 'Sharikh', 'Sharrick',
  'Sherick', 'Sherrick', 'Sherruk', 'Sherak', 'Sheric',
  // AI transcription quirks
  'Charuk', 'Charook', 'Charukh', 'Charok', 'Charuq',
  // Short forms
  'Sharu', 'Sharuq',
  // Mohamed / Muhammad variants
  'Mohamed', 'Mohammed', 'Mohammad', 'Muhammad', 'Muhammed',
  'Muhamad', 'Mohamad', 'Mohamedh', 'Mohammedh',
  'Mohamet', 'Mohammud', 'Mohomet', 'Muhamet',
  'Mohammede', 'Mohamede',
  // Shortened forms
  'Mohd', 'Moh', 'Mo',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const multiWordRegexes = MULTI_WORD_PHRASES.map(
  (phrase) => new RegExp(escapeRegex(phrase), 'gi'),
)

const singleWordRegex = new RegExp(
  `\\b(${SINGLE_WORD_VARIANTS.map(escapeRegex).join('|')})\\b`,
  'gi',
)

/**
 * Replace all known variants of the user's name with NAME_ALIAS.
 * Call this on any text before sending it to an LLM.
 */
export function anonymizeNames(text: string): string {
  let result = text
  for (const re of multiWordRegexes) {
    result = result.replace(re, NAME_ALIAS)
  }
  result = result.replace(singleWordRegex, NAME_ALIAS)
  return result
}
