/**
 * Person-name display formatter proofs. Runnable, no DB / no side effects:
 *   npx tsx scripts/tests/format-name.test.ts
 *
 * Covers the required cases: ordinary names, apostrophes, hyphens, multi-word
 * last names, already-correct names, all-lowercase, all-uppercase — plus the
 * documented conservative limitation (interior capitals typed all-lowercase).
 */
import { formatPersonName } from "@bc/companion-shared";

let pass = 0,
  fail = 0;
function eq(input: string | null | undefined, expected: string, name: string) {
  const got = formatPersonName(input);
  const cond = got === expected;
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  got "${got}" want "${expected}"`}`);
}

// Ordinary first + last names (lowercase)
eq("maria gonzalez", "Maria Gonzalez", "ordinary lowercase");
eq("devon carter", "Devon Carter", "ordinary lowercase 2");
// All-uppercase
eq("MARIA GONZALEZ", "Maria Gonzalez", "all-uppercase");
eq("SARAH KIM", "Sarah Kim", "all-uppercase 2");
// Apostrophes
eq("kevin o'brien", "Kevin O'Brien", "apostrophe lowercase");
eq("KEVIN O'BRIEN", "Kevin O'Brien", "apostrophe uppercase");
// Hyphenated
eq("anna-marie smith", "Anna-Marie Smith", "hyphenated lowercase");
eq("ANNA-MARIE SMITH", "Anna-Marie Smith", "hyphenated uppercase");
// Multiple-word last names
eq("mary jane de la cruz", "Mary Jane De La Cruz", "multi-word last name");
// Already correctly capitalized — must remain correct (idempotent)
eq("Maria Gonzalez", "Maria Gonzalez", "already correct");
eq("Kevin O'Brien", "Kevin O'Brien", "already correct apostrophe");
eq("Anna-Marie Smith", "Anna-Marie Smith", "already correct hyphen");
// Interior-capital surnames typed with the capital are preserved
eq("Aidan McDonald", "Aidan McDonald", "preserves McDonald (mixed-case word)");
eq("Trevon DeShawn", "Trevon DeShawn", "preserves DeShawn (mixed-case word)");
// Whitespace / empties
eq("  jose   ramirez  ", "Jose Ramirez", "extra whitespace collapses");
eq("", "", "empty string");
eq(null, "", "null");
eq(undefined, "", "undefined");
// Documented limitation: interior capital typed all-lowercase is normalized
eq("aidan macdonald", "Aidan Macdonald", "LIMITATION: all-lowercase interior capital");

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`);
if (fail > 0) process.exit(1);
