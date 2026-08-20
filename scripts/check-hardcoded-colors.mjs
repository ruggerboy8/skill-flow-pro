#!/usr/bin/env node
// DSN-3: ratchet guard against hardcoded Tailwind palette colors creeping
// back into src/. Counts bg-/text-/border- classes that name a raw Tailwind
// palette color + numeric shade (e.g. bg-emerald-100, text-red-800), compares
// the total against a committed baseline, and fails the build if the count
// goes UP. It never fails on token-based classes (bg-primary, bg-brand-navy,
// text-muted-foreground, hsl(var(--...))) or non-color utilities that happen
// to share the bg-/text-/border- prefix pattern (border-2, text-2xs, etc).
//
// Usage: node scripts/check-hardcoded-colors.mjs [--update-baseline]
//
// --update-baseline regenerates scripts/hardcoded-colors-baseline.json from
// the current count instead of comparing against it. Use this the same
// commit a migration lands, never as a way to silence a real regression.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const BASELINE_PATH = join(__dirname, 'hardcoded-colors-baseline.json');

// The full Tailwind default palette family names. Anything in this list
// followed by a numeric shade (50, 100, 200, ..., 950) after bg-/text-/
// border- is a hardcoded color, not a token. Tokens (primary, brand-navy,
// muted-foreground, domain-clinical, score-1, status-complete, etc.) never
// match because they aren't in this list or aren't followed by a bare
// numeric shade.
const PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

// Matches hardcoded palette shades behind any color-bearing utility prefix:
// bg-emerald-100, text-red-800, border-blue-950, ring-amber-500, from-amber-950,
// to-violet-600, via-emerald-950, dark:bg-red-100,
// hover:text-emerald-600, bg-red-100/50 (opacity suffix allowed). Does NOT
// match bg-primary, text-muted-foreground, border-2, text-2xs, bg-brand-navy,
// bg-domain-clinical, text-score-1, etc, because those either aren't in
// PALETTE_FAMILIES or aren't followed by a plain numeric shade.
const COLOR_CLASS_RE = new RegExp(
  `(?:^|[\\s"'\`{])((?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|caret|accent|decoration)-(?:${PALETTE_FAMILIES.join('|')})-(?:50|100|200|300|400|500|600|700|800|900|950))(?:/\\d{1,3})?(?=[\\s"'\`}]|$)`,
  'g'
);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile() && ['.ts', '.tsx'].includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function scan() {
  const files = walk(SRC_DIR);
  const perFile = {};
  const instances = [];
  let total = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    let fileCount = 0;

    lines.forEach((line, idx) => {
      COLOR_CLASS_RE.lastIndex = 0;
      let m;
      while ((m = COLOR_CLASS_RE.exec(line)) !== null) {
        fileCount++;
        total++;
        instances.push({ file: rel, line: idx + 1, match: m[1] });
      }
    });

    if (fileCount > 0) {
      perFile[rel] = fileCount;
    }
  }

  return { total, files: perFile, instances };
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeBaseline(result) {
  const baseline = { total: result.total, files: result.files };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Wrote baseline: ${result.total} hardcoded color classes across ${Object.keys(result.files).length} files.`);
}

function main() {
  const updateMode = process.argv.includes('--update-baseline');
  const result = scan();

  if (updateMode) {
    writeBaseline(result);
    return;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error(
      `No baseline found at ${relative(REPO_ROOT, BASELINE_PATH)}.\n` +
      `Run: node scripts/check-hardcoded-colors.mjs --update-baseline`
    );
    process.exit(1);
  }

  if (result.total > baseline.total) {
    console.error(
      `\nHardcoded Tailwind color check FAILED.\n` +
      `Baseline: ${baseline.total} hardcoded color classes. Current: ${result.total} (+${result.total - baseline.total}).\n\n` +
      `New hardcoded classes should be design tokens instead (see\n` +
      `docs/dev/token-migration-pattern.md). Offending instances in files\n` +
      `whose count went up:\n`
    );

    for (const [file, count] of Object.entries(result.files)) {
      const before = baseline.files[file] || 0;
      if (count > before) {
        console.error(`  ${file}  (${before} -> ${count})`);
        for (const inst of result.instances) {
          if (inst.file === file) {
            console.error(`    ${inst.file}:${inst.line}  ${inst.match}`);
          }
        }
      }
    }

    console.error(
      `\nIf this increase is intentional and reviewed (e.g. new code that\n` +
      `hasn't been migrated yet), update the baseline in the same commit:\n` +
      `  node scripts/check-hardcoded-colors.mjs --update-baseline\n`
    );
    process.exit(1);
  }

  if (result.total < baseline.total) {
    console.log(
      `Hardcoded Tailwind color check passed: ${result.total} (down from ${baseline.total} baseline).\n` +
      `Consider regenerating the baseline to lock in the improvement:\n` +
      `  node scripts/check-hardcoded-colors.mjs --update-baseline`
    );
    return;
  }

  console.log(`Hardcoded Tailwind color check passed: ${result.total} (matches baseline).`);
}

main();
