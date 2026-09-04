// Build the Ask Corpus review surface from docs/corpus-draft markdown.
// The corpus content is AES-256-GCM encrypted with a team password; the page
// ships only ciphertext plus an unlock screen.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { marked } = require('./node_modules/marked');

const SRC = '/Users/johnoberly/skill-flow-pro/docs/corpus-draft';
const OUT = path.join(__dirname, 'corpus-review.html');
const PASSWORD = process.env.CORPUS_PW || 'tell-show-do';
const PBKDF2_ITERS = 310000;

marked.setOptions({ gfm: true, breaks: false });

// ---------- doc registry ----------
const CHAPTER_GROUPS = [
  { folder: 'staff-clinical', label: 'Staff · Clinical' },
  { folder: 'staff-clerical', label: 'Staff · Clerical' },
  { folder: 'staff-cultural', label: 'Staff · Cultural' },
  { folder: 'staff-case-acceptance', label: 'Staff · Case Acceptance' },
  { folder: 'doctor-clinical-case', label: 'Doctor · Clinical + Case' },
  { folder: 'doctor-clerical-cultural', label: 'Doctor · Clerical + Cultural' },
];

const PRIORITY = {
  'CLIN-404': 'Quotes AAPD oral sedation dosing numbers. Dr. Alex should verify before anything else in this corpus.',
  'CLER-406': 'Carries the special-consent procedure list and pregnancy-test waiver policy. Legal-adjacent; early doctor review.',
  'CLIN-3': 'Quotes a dollar figure ($125 limited exam fee) from a sourced script. Prices go stale; confirm.',
  'CASE-13': 'Quotes a dollar figure ($30 fluoride portion) from a sourced script. Prices go stale; confirm.',
  'CLIN-1': 'Most gap-dense chapter (6 gaps) and uses the framework term "Red Zone," which is never defined anywhere.',
  'CLER-21': 'Flags real framework data damage: pro move 63 resources are placeholder test links (a music video and yahoo.com).',
  'CASE-45': 'Flags a benefits-language conflict between roles ("estimated family contribution" vs "patient portion"). Needs a canonical ruling.',
};

const docs = []; // {id, navLabel, title, owner, gaps, html, group, flag}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function stripBanner(md) {
  let owner = null;
  const lines = md.split('\n');
  const kept = lines.filter((l) => {
    if (/^>\s*\*\*DRAFT/.test(l)) {
      const m = l.match(/Requires review by (.+?) before entering/);
      if (m) owner = m[1];
      return false;
    }
    return true;
  });
  return { md: kept.join('\n').replace(/^\s+/, ''), owner };
}

function baseConvert(md) {
  let html = marked.parse(md);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return html;
}

// tier + gap markers (safe as global replaces: bracket patterns never occur in attributes)
function markTiers(html) {
  html = html.replace(/\[ALCAN\]\s*/g, '<span class="chip chip-alcan" title="Taken directly from the Pro Moves framework export">Alcan</span> ');
  html = html.replace(/\[GENERAL\]\s*/g, '<span class="chip chip-general" title="Universal best practice drafted by the AI, not Alcan-sourced">General</span> ');
  html = html.replace(/\[GAP:?\s*([^\]\[]*?)\]/g, (m, body) => {
    body = body.trim();
    return body
      ? `<mark class="gap"><span class="gap-tag">Gap</span> ${body}</mark>`
      : '<mark class="gap"><span class="gap-tag">Gap</span></mark>';
  });
  return html;
}

// link file references that sit inside <code> tags
function linkCodeRefs(html, idset) {
  return html.replace(/<code>([^<]*?)<\/code>/g, (m, body) => {
    let target = null;
    let mm = body.match(/((?:CLIN|CLER|CULT|CASE)-\d+)[\w-]*\.md/);
    if (mm && idset.has(mm[1])) target = mm[1];
    else if (/corpus-index\.md/.test(body)) target = 'index';
    else if (/gap-report\.md/.test(body)) target = 'gaps';
    else if (/run-summary\.md/.test(body)) target = 'summary';
    else if (/new-dental-assistant\.md/.test(body)) target = 'q-new-da';
    else if (/veteran-dfi\.md/.test(body)) target = 'q-dfi';
    else if (/office-manager\.md/.test(body)) target = 'q-om';
    else if (/associate-doctor\.md/.test(body)) target = 'q-doctor';
    if (!target) return m;
    return `<a class="xref" href="#${target}">${m}</a>`;
  });
}

// link bare chapter IDs (CLIN-20, RSVD-4) inside text nodes, skipping text already inside <a> and <h1>
function linkPlainIds(html, idset, selfId) {
  const parts = html.split(/(<[^>]+>)/);
  let inA = 0, inH1 = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('<')) {
      if (/^<a[\s>]/.test(p)) inA++;
      else if (p === '</a>') inA = Math.max(0, inA - 1);
      else if (/^<h1[\s>]/.test(p)) inH1++;
      else if (p === '</h1>') inH1 = Math.max(0, inH1 - 1);
      continue;
    }
    if (inA || inH1) continue;
    parts[i] = p
      .replace(/\b((?:CLIN|CLER|CULT|CASE)-\d+)\b/g, (m, id) =>
        idset.has(id) && id !== selfId ? `<a class="xref" href="#${id}">${id}</a>` : m)
      .replace(/\b(RSVD-\d+)\b/g, '<a class="xref xref-shelf" href="#index" title="Reserved shelf — defined in the master index (proposed shelves live in the gap report)">$1</a>');
  }
  return parts.join('');
}

// ---------- load everything ----------
const idset = new Set(['summary', 'index', 'gaps', 'q-new-da', 'q-dfi', 'q-om', 'q-doctor']);
const chapterFiles = [];
for (const g of CHAPTER_GROUPS) {
  const dir = path.join(SRC, 'chapters', g.folder);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const id = f.match(/^((?:CLIN|CLER|CULT|CASE)-\d+)/)[1];
    idset.add(id);
    chapterFiles.push({ id, file: path.join(dir, f), group: g.label, num: parseInt(id.split('-')[1], 10) });
  }
}
chapterFiles.sort((a, b) => a.group.localeCompare(b.group) || a.num - b.num);

function loadDoc(id, file, navLabel, group) {
  const raw = fs.readFileSync(file, 'utf8');
  const { md, owner } = stripBanner(raw);
  const gaps = (md.match(/\[GAP/g) || []).length;
  const h1 = md.match(/^#\s+(.+)$/m);
  let title = h1 ? h1[1].trim() : navLabel;
  let html = baseConvert(md);
  html = markTiers(html);
  html = linkCodeRefs(html, idset);
  html = linkPlainIds(html, idset, id);
  docs.push({ id, navLabel, title, owner, gaps, html, group, flag: PRIORITY[id] || null });
}

loadDoc('summary', path.join(SRC, 'run-summary.md'), 'Run summary', 'Start here');
loadDoc('index', path.join(SRC, 'corpus-index.md'), 'Master index', 'Start here');
loadDoc('gaps', path.join(SRC, 'gap-report.md'), 'Gap report', 'Start here');
loadDoc('q-new-da', path.join(SRC, 'questions/new-dental-assistant.md'), 'New dental assistant', 'Question banks');
loadDoc('q-dfi', path.join(SRC, 'questions/veteran-dfi.md'), 'Veteran DFI', 'Question banks');
loadDoc('q-om', path.join(SRC, 'questions/office-manager.md'), 'Office manager', 'Question banks');
loadDoc('q-doctor', path.join(SRC, 'questions/associate-doctor.md'), 'Associate doctor', 'Question banks');

for (const c of chapterFiles) {
  const raw = fs.readFileSync(c.file, 'utf8');
  const h1 = raw.match(/^#\s+(.+)$/m);
  let short = h1 ? h1[1].replace(/^(?:CLIN|CLER|CULT|CASE)-\d+\s*:?\s*/, '') : c.id;
  loadDoc(c.id, c.file, short, c.group);
}

// ---------- assemble app markup (this part gets encrypted) ----------
const groupsOrdered = ['Start here', 'Question banks', ...CHAPTER_GROUPS.map((g) => g.label)];

function navHtml() {
  return groupsOrdered.map((g) => {
    const items = docs.filter((d) => d.group === g).map((d) => {
      const isChapter = /^(CLIN|CLER|CULT|CASE)-/.test(d.id);
      return `<a class="nav-item" href="#${d.id}" data-doc="${d.id}" data-search="${esc((d.id + ' ' + d.navLabel).toLowerCase())}">
        <span class="nav-check" aria-hidden="true"></span>
        ${isChapter ? `<span class="nav-id">${d.id}</span>` : ''}
        <span class="nav-label">${esc(d.navLabel)}</span>
        ${d.flag ? '<span class="nav-flag" title="Priority review item">!</span>' : ''}
        ${d.gaps ? `<span class="nav-gaps" title="${d.gaps} gap markers">${d.gaps}</span>` : ''}
      </a>`;
    }).join('');
    return `<div class="nav-group"><div class="nav-group-title">${esc(g)}</div>${items}</div>`;
  }).join('');
}

function docHeader(d) {
  const ownerBit = d.owner ? `<span class="meta-item">Review owner: <strong>${esc(d.owner)}</strong></span>` : '';
  const gapBit = d.gaps ? `<span class="meta-item">${d.gaps} gap marker${d.gaps === 1 ? '' : 's'}</span>` : '';
  const flagBit = d.flag ? `<div class="flag-callout"><span class="flag-badge">Priority review</span> ${esc(d.flag)}</div>` : '';
  return `<div class="doc-head">
    <div class="doc-head-row">
      <div class="doc-meta">${ownerBit}${gapBit}</div>
      <button class="review-toggle" data-doc="${d.id}" type="button">Mark reviewed</button>
    </div>${flagBit}
  </div>`;
}

const helpBlock = `<div class="help-card">
  <div class="help-title">How to review</div>
  <ul>
    <li>Everything here is an <strong>AI-drafted starting point</strong> for Alcan's knowledge library. Nothing is official until a human blesses it. Your job: say what's wrong, what's missing, and what's actually right. Be picky.</li>
    <li>Three labels matter as you read. <span class="chip chip-alcan">Alcan</span> was pulled from our Pro Moves framework: check it's still true. <span class="chip chip-general">General</span> is general best practice a computer drafted: check it sounds like us. <mark class="gap"><span class="gap-tag">Gap</span> a question only a human can answer</mark>: if that human is you, answer it in a comment.</li>
    <li>Find your chapters in the left sidebar (the filter box helps); each shows its review owner at the top. Anything marked <span class="nav-flag-inline">!</span> is priority, start there.</li>
    <li><strong>To give feedback, highlight any text and click the blue "Add note" button</strong> that pops up. Plain words are perfect: "we don't do this anymore" or "the fee is $140 now."</li>
    <li>When you finish a chapter, click <strong>"Mark reviewed"</strong> at the top, even if you had no notes on it. That's how John knows you covered it.</li>
    <li>When you're done for the day, open <strong>"Send report to John"</strong> at the bottom of the sidebar and hit <strong>Copy report</strong> (paste it into a text or email) or <strong>Email to John</strong>. The report carries your notes and your reviewed checklist in one go, and the fixes get made for you.</li>
  </ul>
</div>`;

const sections = docs.map((d) =>
  `<section class="doc" id="${d.id}" data-group="${esc(d.group)}">
    ${docHeader(d)}
    ${d.id === 'summary' ? helpBlock : ''}
    <article class="prose">${d.html}</article>
  </section>`).join('\n');

const appHtml = `<button class="menu-btn" id="menuBtn" type="button">Menu</button>
<div class="app">
  <nav class="sidebar" id="sidebar" aria-label="Corpus documents">
    <div class="side-head">
      <div class="side-brand">Ask Corpus <small>Review room · draft of 2026-08-20</small></div>
      <div class="progress"><span id="progressText"></span>
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
      </div>
    </div>
    <div class="side-filter"><input id="filter" type="search" placeholder="Filter documents…" aria-label="Filter documents"></div>
    <div class="nav-scroll" id="nav">${navHtml()}</div>
    <div class="side-foot">
      <button class="mode-toggle" id="notesBtn" type="button">Send report to John</button>
      <button class="mode-toggle" id="modeToggle" type="button">Switch to continuous reading</button>
    </div>
  </nav>
  <main class="main">
${sections}
  </main>
</div>`;

// ---------- encrypt ----------
const payload = JSON.stringify({ html: appHtml, docs: docs.map((d) => d.id) });
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(PASSWORD, salt, PBKDF2_ITERS, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final(), cipher.getAuthTag()]);

// ---------- shell page (ships in the clear; holds no corpus content) ----------
const page = `<meta charset="utf-8">
<title>Ask Corpus Review Room</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --paper:#F5F7FA; --panel:#FFFFFF; --ink:#182A3D; --ink-soft:#51637A; --line:#DAE2EA;
  --brand:#113B62; --accent:#005286; --accent-soft:#E3EEF6;
  --alcan-bg:#E1EDF6; --alcan-fg:#075587; --general-bg:#EBEEF2; --general-fg:#5C6E80;
  --gap-bg:#FBF1DC; --gap-fg:#7A5210; --gap-border:#E7CE9C;
  --flag:#A33B2E; --flag-bg:#F9E9E5; --ok:#2E7D5B; --ok-bg:#E4F1EA;
  --shadow:0 1px 3px rgba(17,59,98,.08);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#0E161F; --panel:#151F2A; --ink:#E2EAF2; --ink-soft:#94A6B9; --line:#243141;
    --brand:#8FBCE0; --accent:#6FAEDC; --accent-soft:#17293B;
    --alcan-bg:#14293A; --alcan-fg:#8CC0E8; --general-bg:#1E2937; --general-fg:#9DACBD;
    --gap-bg:#2C2310; --gap-fg:#DFB264; --gap-border:#4C3D1A;
    --flag:#E08170; --flag-bg:#32201C; --ok:#5FB98E; --ok-bg:#16291F;
    --shadow:0 1px 3px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"]{
  --paper:#0E161F; --panel:#151F2A; --ink:#E2EAF2; --ink-soft:#94A6B9; --line:#243141;
  --brand:#8FBCE0; --accent:#6FAEDC; --accent-soft:#17293B;
  --alcan-bg:#14293A; --alcan-fg:#8CC0E8; --general-bg:#1E2937; --general-fg:#9DACBD;
  --gap-bg:#2C2310; --gap-fg:#DFB264; --gap-border:#4C3D1A;
  --flag:#E08170; --flag-bg:#32201C; --ok:#5FB98E; --ok-bg:#16291F;
  --shadow:0 1px 3px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.65}

/* ---------- unlock gate ---------- */
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.gate-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:34px 34px 30px;max-width:400px;width:100%}
.gate-brand{font-weight:700;font-size:19px;color:var(--brand)}
.gate-brand small{display:block;font-weight:500;color:var(--ink-soft);font-size:12px;margin-top:3px;letter-spacing:.05em;text-transform:uppercase}
.gate-note{font-size:13.5px;color:var(--ink-soft);margin:14px 0 18px}
.gate-row{display:flex;gap:8px}
.gate-row input{flex:1;min-width:0;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px}
.gate-row input:focus{outline:2px solid var(--accent);outline-offset:1px}
.gate-row button{padding:9px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.gate-row button:hover{filter:brightness(1.08)}
.gate-row button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.gate-err{display:none;margin-top:12px;font-size:13px;color:var(--flag);background:var(--flag-bg);border-radius:7px;padding:8px 12px}
.gate-err.show{display:block}
.gate-busy{display:none;margin-top:12px;font-size:13px;color:var(--ink-soft)}
.gate-busy.show{display:block}

/* ---------- sidebar ---------- */
.app{display:flex;min-height:100vh}
.sidebar{width:304px;flex:none;background:var(--panel);border-right:1px solid var(--line);position:sticky;top:0;height:100vh;display:flex;flex-direction:column}
.side-head{padding:18px 18px 12px;border-bottom:1px solid var(--line)}
.side-brand{font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--brand)}
.side-brand small{display:block;font-weight:500;color:var(--ink-soft);font-size:12px;margin-top:2px;letter-spacing:.04em;text-transform:uppercase}
.progress{margin-top:10px;font-size:12px;color:var(--ink-soft);font-variant-numeric:tabular-nums}
.progress-bar{height:4px;background:var(--line);border-radius:2px;margin-top:5px;overflow:hidden}
.progress-fill{height:100%;width:0;background:var(--ok);border-radius:2px;transition:width .25s}
@media (prefers-reduced-motion: reduce){.progress-fill{transition:none}}
.side-filter{padding:10px 14px;border-bottom:1px solid var(--line)}
.side-filter input{width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);font:inherit;font-size:13px}
.side-filter input:focus{outline:2px solid var(--accent);outline-offset:1px}
.nav-scroll{overflow-y:auto;flex:1;padding:8px 8px 20px}
.nav-group-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);padding:14px 10px 5px}
.nav-item{display:flex;align-items:center;gap:7px;width:100%;text-align:left;padding:6px 10px;border-radius:7px;color:var(--ink);text-decoration:none;font-size:13.5px;line-height:1.35}
.nav-item:hover{background:var(--paper)}
.nav-item.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
.nav-id{font-family:'Spline Sans Mono',monospace;font-size:11px;color:var(--ink-soft);flex:none;width:64px}
.nav-item.active .nav-id{color:var(--accent)}
.nav-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-gaps{flex:none;font-size:10.5px;font-family:'Spline Sans Mono',monospace;color:var(--gap-fg);background:var(--gap-bg);border:1px solid var(--gap-border);border-radius:9px;padding:0 5px;line-height:15px}
.nav-flag,.nav-flag-inline{flex:none;width:15px;height:15px;border-radius:50%;background:var(--flag-bg);color:var(--flag);font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.nav-check{flex:none;width:13px;height:13px;border:1.5px solid var(--line);border-radius:50%}
.nav-item.reviewed .nav-check{background:var(--ok);border-color:var(--ok)}
.side-foot{padding:10px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.mode-toggle{width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink-soft);font:inherit;font-size:12.5px;cursor:pointer}
.mode-toggle:hover{color:var(--ink)}
.mode-toggle:focus-visible,.review-toggle:focus-visible,.nav-item:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

/* ---------- main ---------- */
.main{flex:1;min-width:0;padding:28px 40px 90px}
.doc{display:none;max-width:74ch;margin:0 auto}
.doc.visible{display:block}
body.all-mode .doc{display:block;border-bottom:1px solid var(--line);padding-bottom:48px;margin-bottom:48px}
.doc-head{margin-bottom:6px}
.doc-head-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.doc-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-soft)}
.review-toggle{padding:5px 12px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--ink-soft);font:inherit;font-size:12.5px;cursor:pointer}
.review-toggle.on{background:var(--ok-bg);border-color:var(--ok);color:var(--ok);font-weight:600}
.flag-callout{margin-top:10px;background:var(--flag-bg);border:1px solid var(--flag);border-radius:9px;padding:10px 14px;font-size:13.5px;color:var(--ink)}
.flag-badge{display:inline-block;background:var(--flag);color:var(--paper);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-radius:5px;padding:2px 7px;margin-right:7px}

.help-card{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:16px 20px;margin:14px 0 6px;box-shadow:var(--shadow)}
.help-title{font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand);margin-bottom:8px}
.help-card ul{margin:0;padding-left:20px;font-size:14px}
.help-card li{margin:5px 0}

/* ---------- prose ---------- */
.prose h1{font-size:27px;line-height:1.25;font-weight:700;color:var(--brand);text-wrap:balance;margin:14px 0 14px}
.prose h2{font-size:19px;font-weight:700;margin:34px 0 10px;color:var(--ink)}
.prose h3{font-size:16px;font-weight:600;margin:24px 0 8px}
.prose h4{font-size:14.5px;font-weight:600;margin:18px 0 6px}
.prose p,.prose li{color:var(--ink)}
.prose a{color:var(--accent)}
.prose blockquote{margin:14px 0;padding:10px 16px;border-left:3px solid var(--accent);background:var(--panel);border-radius:0 9px 9px 0;color:var(--ink);font-style:italic}
.prose blockquote p{margin:6px 0}
.prose code{font-family:'Spline Sans Mono',monospace;font-size:.85em;background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.prose hr{border:none;border-top:1px solid var(--line);margin:30px 0}
.table-wrap{overflow-x:auto;margin:16px 0;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
.prose table{border-collapse:collapse;width:100%;font-size:13.5px}
.prose th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);text-align:left}
.prose th,.prose td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.prose tr:last-child td{border-bottom:none}
.xref{text-decoration:none;border-bottom:1px dotted var(--accent)}
.xref code{color:var(--accent)}

.chip{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-radius:5px;padding:1.5px 7px;vertical-align:baseline;line-height:1.5}
.chip-alcan{background:var(--alcan-bg);color:var(--alcan-fg)}
.chip-general{background:var(--general-bg);color:var(--general-fg)}
.gap{background:var(--gap-bg);color:var(--gap-fg);border:1px solid var(--gap-border);border-radius:6px;padding:1px 6px;font-size:.92em}
.gap-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-right:3px}

/* ---------- review notes ---------- */
.note-pill{position:fixed;z-index:40;display:none;padding:7px 14px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-family:'Archivo',system-ui,sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3)}
.note-pill.show{display:block}
.overlay{position:fixed;inset:0;background:rgba(8,16,24,.5);z-index:45;display:none}
.overlay.show{display:flex;align-items:center;justify-content:center;padding:20px}
.note-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;max-width:480px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.note-card-title{font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--brand)}
.note-quote{font-size:12.5px;color:var(--ink-soft);border-left:3px solid var(--gap-border);background:var(--gap-bg);padding:8px 10px;border-radius:0 6px 6px 0;max-height:96px;overflow-y:auto;margin:10px 0;font-style:italic}
.note-card input,.note-card textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);font:inherit;font-size:13.5px;margin-top:8px}
.note-card textarea{min-height:96px;resize:vertical}
.note-card input:focus,.note-card textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.note-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.btn-primary{padding:8px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.btn-quiet{padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink-soft);font:inherit;font-size:13px;cursor:pointer}
.btn-primary:focus-visible,.btn-quiet:focus-visible,.note-pill:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.drawer{position:fixed;top:0;right:0;height:100vh;width:400px;max-width:94vw;background:var(--panel);border-left:1px solid var(--line);z-index:46;transform:translateX(105%);transition:transform .2s;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.15)}
@media (prefers-reduced-motion: reduce){.drawer{transition:none}}
.drawer.show{transform:none}
.drawer-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.drawer-title{font-weight:700;font-size:14px;color:var(--brand)}
.drawer-close{border:none;background:none;color:var(--ink-soft);font-size:20px;line-height:1;cursor:pointer;padding:4px}
.drawer-list{flex:1;overflow-y:auto;padding:14px 18px}
.drawer-empty{font-size:13.5px;color:var(--ink-soft)}
.note-item{border:1px solid var(--line);border-radius:9px;padding:10px 12px;margin-bottom:10px;font-size:13.5px;position:relative}
.note-item-doc{font-family:'Spline Sans Mono',monospace;font-size:11px;color:var(--accent)}
.note-item-quote{color:var(--ink-soft);font-style:italic;margin:4px 0;font-size:12.5px}
.note-item-del{position:absolute;top:8px;right:10px;border:none;background:none;color:var(--ink-soft);cursor:pointer;font-size:12px}
.note-item-del:hover{color:var(--flag)}
.drawer-foot{padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:8px}
.drawer-foot .btn-primary,.drawer-foot .btn-quiet{flex:1}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--brand);color:var(--paper);padding:10px 18px;border-radius:9px;font-size:13.5px;font-weight:500;z-index:60;display:none;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.toast.show{display:block}

/* ---------- mobile ---------- */
.menu-btn{display:none;position:fixed;top:12px;left:12px;z-index:30;padding:8px 13px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:var(--shadow)}
@media (max-width: 920px){
  .menu-btn{display:block}
  .sidebar{position:fixed;left:0;top:0;z-index:20;transform:translateX(-105%);transition:transform .2s;box-shadow:0 0 40px rgba(0,0,0,.25)}
  @media (prefers-reduced-motion: reduce){.sidebar{transition:none}}
  body.nav-open .sidebar{transform:translateX(0)}
  .main{padding:60px 20px 80px}
}
</style>
<div class="gate" id="gate">
  <div class="gate-card">
    <div class="gate-brand">Ask Corpus <small>Review room</small></div>
    <p class="gate-note">This room holds internal Alcan training drafts. Enter the team password to open it. If you don't have it, ask John.</p>
    <div class="gate-row">
      <input id="pw" type="password" placeholder="Team password" aria-label="Team password" autocomplete="current-password">
      <button id="unlockBtn" type="button">Open</button>
    </div>
    <div class="gate-busy" id="gateBusy">Unlocking…</div>
    <div class="gate-err" id="gateErr">That's not it. Check the password and try again.</div>
  </div>
</div>
<div id="appRoot"></div>
<button class="note-pill" id="notePill" type="button">&#9998; Add note</button>
<div class="overlay" id="noteOverlay">
  <div class="note-card">
    <div class="note-card-title">Add a review note</div>
    <div class="note-quote" id="noteQuote"></div>
    <input id="noteName" type="text" placeholder="Your name" aria-label="Your name">
    <textarea id="noteText" placeholder="What's wrong, what's missing, or what should it say instead?" aria-label="Your note"></textarea>
    <div class="note-actions">
      <button class="btn-quiet" id="noteCancel" type="button">Cancel</button>
      <button class="btn-primary" id="noteSave" type="button">Save note</button>
    </div>
  </div>
</div>
<div class="drawer" id="drawer" aria-label="My review notes">
  <div class="drawer-head">
    <span class="drawer-title">My review report</span>
    <button class="drawer-close" id="drawerClose" type="button" aria-label="Close">&times;</button>
  </div>
  <div class="drawer-list" id="drawerList"></div>
  <div class="drawer-foot">
    <button class="btn-primary" id="copyNotes" type="button">Copy report</button>
    <button class="btn-quiet" id="emailNotes" type="button">Email to John</button>
  </div>
</div>
<div class="toast" id="toast" role="status"></div>
<script>
var ENC={salt:'${salt.toString('base64')}',iv:'${iv.toString('base64')}',iters:${PBKDF2_ITERS},data:'${ct.toString('base64')}'};

function b64d(s){var bin=atob(s),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}

async function decryptWith(pw){
  var enc=new TextEncoder();
  var km=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
  var key=await crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:b64d(ENC.salt),iterations:ENC.iters,hash:'SHA-256'},
    km,{name:'AES-GCM',length:256},false,['decrypt']);
  var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(ENC.iv)},key,b64d(ENC.data));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------- review notes (local to each reviewer's browser) ----------
var NKEY='askCorpusNotes.v1', NAMEKEY='askCorpusReviewer.v1';
function loadNotes(){try{return JSON.parse(localStorage.getItem(NKEY)||'[]')}catch(e){return []}}
function saveNotes(n){try{localStorage.setItem(NKEY,JSON.stringify(n))}catch(e){}}
function toast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('show')},2600);
}
function docTitle(id){
  var sec=document.getElementById(id);
  var h=sec&&sec.querySelector('h1');
  return h?h.textContent.trim():id;
}
function loadReviewed(){
  var out=[];
  try{
    var st=JSON.parse(localStorage.getItem('askCorpusReview.v1')||'{}');
    for(var k in st)if(st[k])out.push(k);
  }catch(e){}
  return out;
}
function updateNotesBadge(){
  var btn=document.getElementById('notesBtn');
  if(!btn)return;
  var n=loadNotes().length;
  btn.textContent=n?'Send report to John ('+n+' notes)':'Send report to John';
}
function renderDrawer(){
  var list=document.getElementById('drawerList');
  var notes=loadNotes();
  var reviewed=loadReviewed();
  var head='<div class="note-item"><div class="note-item-doc">REVIEWED SO FAR</div><div>'
    +(reviewed.length?reviewed.length+' document'+(reviewed.length===1?'':'s')+': '+escapeHtml(reviewed.join(', ')):'None marked yet. The "Mark reviewed" button at the top of each document feeds this list.')
    +'</div></div>';
  if(!notes.length){
    list.innerHTML=head+'<div class="drawer-empty">No notes yet. Highlight any text in a chapter and click "Add note" to start. Everything saves on this device until you send your report.</div>';
    return;
  }
  list.innerHTML=head+notes.map(function(n,i){
    return '<div class="note-item">'
      +'<button class="note-item-del" data-i="'+i+'" type="button">delete</button>'
      +'<div class="note-item-doc">'+escapeHtml(n.docId)+'</div>'
      +(n.quote?'<div class="note-item-quote">&ldquo;'+escapeHtml(n.quote)+'&rdquo;</div>':'')
      +'<div>'+escapeHtml(n.note)+'</div>'
      +'</div>';
  }).join('');
  list.querySelectorAll('.note-item-del').forEach(function(b){
    b.addEventListener('click',function(){
      var notes=loadNotes();notes.splice(parseInt(b.getAttribute('data-i'),10),1);
      saveNotes(notes);renderDrawer();updateNotesBadge();
    });
  });
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function formatReport(){
  var notes=loadNotes();
  var reviewed=loadReviewed();
  var name='';try{name=localStorage.getItem(NAMEKEY)||''}catch(e){}
  var out='Ask Corpus review report'+(name?' from '+name:'')+' - '+new Date().toLocaleDateString()+'\\n\\n';
  out+='Marked reviewed ('+reviewed.length+'): '+(reviewed.length?reviewed.join(', '):'none yet')+'\\n\\n';
  if(notes.length){
    out+='Notes:\\n\\n';
    notes.forEach(function(n){
      out+='['+n.docId+'] '+docTitle(n.docId)+'\\n';
      if(n.quote)out+='Text: "'+n.quote+'"\\n';
      out+='Note: '+n.note+'\\n\\n';
    });
  }else{
    out+='No notes.\\n';
  }
  return out;
}
function copyText(text,okMsg){
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    var ok=false;try{ok=document.execCommand('copy')}catch(e){}
    document.body.removeChild(ta);
    toast(ok?okMsg:'Copy failed. Select the notes manually.');
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast(okMsg)},fallback);
  }else{fallback()}
}
function initNotesUI(){
  var pill=document.getElementById('notePill');
  var overlay=document.getElementById('noteOverlay');
  var pending=null;
  function hidePill(){pill.classList.remove('show')}
  function onSelEnd(){
    setTimeout(function(){
      if(overlay.classList.contains('show'))return;
      var sel=window.getSelection();
      var txt=sel&&!sel.isCollapsed?sel.toString().trim():'';
      if(!txt){hidePill();return}
      var node=sel.anchorNode;
      var elx=node&&(node.nodeType===1?node:node.parentElement);
      var sec=elx&&elx.closest?elx.closest('section.doc'):null;
      if(!sec){hidePill();return}
      var r=sel.getRangeAt(0).getBoundingClientRect();
      pending={docId:sec.id,quote:txt.slice(0,300)};
      pill.style.top=Math.min(window.innerHeight-52,r.bottom+8)+'px';
      pill.style.left=Math.max(8,Math.min(window.innerWidth-130,r.left+r.width/2-52))+'px';
      pill.classList.add('show');
    },10);
  }
  document.addEventListener('mouseup',onSelEnd);
  document.addEventListener('touchend',onSelEnd);
  pill.addEventListener('mousedown',function(e){e.preventDefault()});
  pill.addEventListener('click',function(){
    if(!pending)return;
    hidePill();
    document.getElementById('noteQuote').textContent='“'+pending.quote+'”';
    try{document.getElementById('noteName').value=localStorage.getItem(NAMEKEY)||''}catch(e){}
    document.getElementById('noteText').value='';
    overlay.classList.add('show');
    document.getElementById('noteText').focus();
  });
  document.getElementById('noteCancel').addEventListener('click',function(){overlay.classList.remove('show')});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.classList.remove('show')});
  document.getElementById('noteSave').addEventListener('click',function(){
    var note=document.getElementById('noteText').value.trim();
    if(!note){toast('Write the note first.');return}
    var name=document.getElementById('noteName').value.trim();
    try{if(name)localStorage.setItem(NAMEKEY,name)}catch(e){}
    var notes=loadNotes();
    notes.push({docId:pending.docId,quote:pending.quote,note:note,name:name,ts:Date.now()});
    saveNotes(notes);
    overlay.classList.remove('show');
    pending=null;
    updateNotesBadge();
    toast('Note saved. Send them all from "My review notes" when you finish.');
  });
  var drawer=document.getElementById('drawer');
  document.getElementById('drawerClose').addEventListener('click',function(){drawer.classList.remove('show')});
  function reportEmpty(){
    return !loadNotes().length&&!loadReviewed().length;
  }
  document.getElementById('copyNotes').addEventListener('click',function(){
    if(reportEmpty()){toast('Nothing to report yet: no notes, nothing marked reviewed.');return}
    copyText(formatReport(),'Report copied. Paste it into a text or email to John.');
  });
  document.getElementById('emailNotes').addEventListener('click',function(){
    if(reportEmpty()){toast('Nothing to report yet: no notes, nothing marked reviewed.');return}
    var body=formatReport();
    if(body.length>1600){
      copyText(body,'Too long for an email link, so it was copied instead. Paste it into an email to John.');
      return;
    }
    var href='mailto:johno@reallygoodconsulting.org?subject='+encodeURIComponent('Ask Corpus review report')+'&body='+encodeURIComponent(body);
    var a=document.createElement('a');a.href=href;a.click();
    copyText(body,'Opening your email app. Notes were also copied in case it did not open.');
  });
  window.openNotesDrawer=function(){renderDrawer();drawer.classList.add('show')};
}
initNotesUI();

function initApp(docs){
  var nb=document.getElementById('notesBtn');
  if(nb)nb.addEventListener('click',function(){window.openNotesDrawer()});
  updateNotesBadge();
  var KEY='askCorpusReview.v1';
  var state={};
  try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}

  function updateProgress(){
    var n=docs.filter(function(id){return state[id]}).length;
    document.getElementById('progressText').textContent='Reviewed '+n+' of '+docs.length;
    document.getElementById('progressFill').style.width=(100*n/docs.length)+'%';
    docs.forEach(function(id){
      var nav=document.querySelector('.nav-item[data-doc="'+id+'"]');
      if(nav)nav.classList.toggle('reviewed',!!state[id]);
      var btn=document.querySelector('.review-toggle[data-doc="'+id+'"]');
      if(btn){btn.classList.toggle('on',!!state[id]);btn.textContent=state[id]?'Reviewed ✓':'Mark reviewed';}
    });
  }
  document.querySelectorAll('.review-toggle').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=btn.getAttribute('data-doc');
      state[id]=!state[id];save();updateProgress();
    });
  });

  var allMode=false;
  function currentId(){
    var h=(location.hash||'').replace('#','');
    return docs.indexOf(h)>=0?h:'summary';
  }
  function render(){
    var id=currentId();
    if(!allMode){
      docs.forEach(function(d){document.getElementById(d).classList.toggle('visible',d===id)});
      window.scrollTo(0,0);
    }else{
      var el=document.getElementById(id);
      if(el)el.scrollIntoView();
    }
    document.querySelectorAll('.nav-item').forEach(function(n){
      n.classList.toggle('active',n.getAttribute('data-doc')===id);
    });
    document.body.classList.remove('nav-open');
  }
  window.addEventListener('hashchange',render);

  document.getElementById('modeToggle').addEventListener('click',function(){
    allMode=!allMode;
    document.body.classList.toggle('all-mode',allMode);
    this.textContent=allMode?'Switch to one-document view':'Switch to continuous reading';
    if(!allMode)render();
  });

  document.getElementById('filter').addEventListener('input',function(){
    var q=this.value.trim().toLowerCase();
    document.querySelectorAll('.nav-item').forEach(function(n){
      n.style.display=(!q||n.getAttribute('data-search').indexOf(q)>=0)?'':'none';
    });
    document.querySelectorAll('.nav-group').forEach(function(g){
      var any=Array.prototype.some.call(g.querySelectorAll('.nav-item'),function(n){return n.style.display!=='none'});
      g.style.display=any?'':'none';
    });
  });

  document.getElementById('menuBtn').addEventListener('click',function(){
    document.body.classList.toggle('nav-open');
  });

  updateProgress();
  render();
}

(function(){
  var gate=document.getElementById('gate');
  var input=document.getElementById('pw');
  var btn=document.getElementById('unlockBtn');
  var err=document.getElementById('gateErr');
  var busy=document.getElementById('gateBusy');
  var SKEY='askCorpus.pw';

  async function tryUnlock(pw,silent){
    err.classList.remove('show');
    busy.classList.add('show');
    btn.disabled=true;
    try{
      var obj=await decryptWith(pw);
      try{sessionStorage.setItem(SKEY,pw)}catch(e){}
      gate.style.display='none';
      document.getElementById('appRoot').innerHTML=obj.html;
      initApp(obj.docs);
    }catch(e){
      try{sessionStorage.removeItem(SKEY)}catch(e2){}
      if(!silent){err.classList.add('show');input.select();}
    }finally{
      busy.classList.remove('show');
      btn.disabled=false;
    }
  }

  btn.addEventListener('click',function(){if(input.value)tryUnlock(input.value,false)});
  input.addEventListener('keydown',function(e){if(e.key==='Enter'&&input.value)tryUnlock(input.value,false)});

  var saved=null;
  try{saved=sessionStorage.getItem(SKEY)}catch(e){}
  if(saved){tryUnlock(saved,true)}else{input.focus()}
})();
</script>`;

fs.writeFileSync(OUT, page);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('Wrote', OUT, kb + 'KB (encrypted payload)');
console.log('Docs:', docs.length, '| chapters:', chapterFiles.length);
const noOwner = docs.filter((d) => !d.owner).map((d) => d.id);
if (noOwner.length) console.log('No owner parsed for:', noOwner.join(', '));
