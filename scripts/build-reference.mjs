#!/usr/bin/env node
/**
 * Build the setting reference shown in the "Tra cứu" panel from your own Markdown notes.
 *
 *   node scripts/build-reference.mjs --title "My Setting" --out client/src/data/reference.local.json notes/*.md
 *
 * Input format (one file = one section):
 *   # Section title            (e.g. "Weapons & Items")
 *   ## Group                   (a heading inside the section)
 *   ### Card                   (one searchable entry; the lines below it are its body, in Markdown)
 * A line or bullet starting with 🔒 (and the bullets nested under it) is DM-only: the server
 * strips it for players. Output is local data for content you own — keep it out of git
 * (`*.local.json` is ignored).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
let title = 'Tra cứu';
let out = 'client/src/data/reference.local.json';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--title') title = args[++i];
  else if (args[i] === '--out') out = args[++i];
  else files.push(args[i]);
}
if (!files.length) {
  console.error('Usage: node scripts/build-reference.mjs --title "…" --out <file.json> <notes.md>…');
  process.exit(1);
}

const sections = files.map((file) => {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const section = { title: basename(file, '.md'), groups: [] };
  let group = null;
  let card = null;
  const flush = () => {
    if (card) card.body = card.body.join('\n').trim();
    card = null;
  };
  for (const line of lines) {
    let m;
    if ((m = /^# (.+)/.exec(line))) {
      section.title = m[1].trim();
    } else if ((m = /^## (.+)/.exec(line))) {
      flush();
      group = { title: m[1].trim(), cards: [] };
      section.groups.push(group);
    } else if ((m = /^### (.+)/.exec(line))) {
      flush();
      if (!group) {
        group = { title: section.title, cards: [] };
        section.groups.push(group);
      }
      card = { title: m[1].trim(), body: [] };
      group.cards.push(card);
    } else if (card) {
      card.body.push(line);
    }
  }
  flush();
  section.groups = section.groups.filter((g) => g.cards.length);
  return section;
});

const data = { title, generatedAt: new Date().toISOString(), sections };
writeFileSync(out, JSON.stringify(data));
const cards = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.cards.length, 0), 0);
console.log(`${out}: ${sections.length} sections, ${cards} cards`);
