import {
  applySpecies,
  derivedSubclassFeatures,
  matchSpecies,
  sheetFromPdfFields,
  type PdfField,
  type PdfSheetResult,
} from '@dnd-table/shared';
import { SPECIES_DEFS } from './speciesData.js';
import { SUBCLASS_DEFS } from './subclassData.js';

/**
 * Read a fillable character-sheet PDF in the browser (nothing is uploaded) and turn it into a
 * CharacterSheet. pdf-lib is loaded on demand so it doesn't bloat the main bundle.
 */
export async function readPdfFields(data: ArrayBuffer): Promise<PdfField[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox } = await import('pdf-lib');
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = doc.getPages();
  const out: PdfField[] = [];
  for (const f of doc.getForm().getFields()) {
    let value: string | undefined;
    let checked: boolean | undefined;
    if (f instanceof PDFTextField) value = f.getText() ?? undefined;
    else if (f instanceof PDFCheckBox) checked = f.isChecked();
    else continue;
    for (const w of f.acroField.getWidgets()) {
      const r = w.getRectangle();
      const ref = w.P();
      out.push({
        name: f.getName(),
        value,
        checked,
        page: pages.findIndex((p) => p.ref === ref),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return out;
}

export async function importPdfSheet(
  file: File,
  ownerId: string,
  newId: () => string,
): Promise<PdfSheetResult> {
  const fields = await readPdfFields(await file.arrayBuffer());
  if (fields.length === 0) {
    throw new Error('PDF này không có ô nhập liệu (đã bị "in phẳng"?) nên app không đọc được.');
  }
  const res = sheetFromPdfFields(fields, ownerId, newId);
  if (!res) throw new Error('Không nhận ra mẫu phiếu này — hiện chỉ đọc được mẫu "Sirindoodles" 5e.');
  // Some players type only the subclass in the CLASS box ("Sinner"): find its class in the local subclass data.
  const KNOWN = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard', 'artificer'];
  if (!KNOWN.includes(res.sheet.className.trim().toLowerCase())) {
    const typed = (res.sheet.className + ' ' + (res.sheet.subclass ?? '')).trim().toLowerCase();
    const hit = SUBCLASS_DEFS.find((d) => typed === d.subclass.toLowerCase() || typed.includes(d.subclass.toLowerCase()));
    if (hit) {
      const cls = hit.class.charAt(0).toUpperCase() + hit.class.slice(1);
      res.report.push(`Class: ${cls} (nhận từ subclass "${hit.subclass}")`);
      res.sheet.className = cls;
      res.sheet.subclass = hit.subclass;
    }
  }
  // Snap the typed subclass ("Circle of the old way") to the official name in the local subclass data.
  const known = derivedSubclassFeatures({ ...res.sheet, level: 20 }, SUBCLASS_DEFS)[0]?.subclass;
  if (known && known !== res.sheet.subclass) {
    res.report.push(`Subclass: ${known} (từ "${res.sheet.subclass}") — features tự hiện`);
    res.sheet.subclass = known;
  }
  // The sheet's RACE box: if it names a species we have data for (typos forgiven), apply it.
  const race = /Chủng tộc: (.+)/.exec(res.sheet.notes)?.[1]?.trim();
  const def = matchSpecies(SPECIES_DEFS, race);
  if (def) {
    res.sheet = applySpecies(res.sheet, def, newId);
    res.report.push(`Species: ${def.name} (từ ô RACE "${race}")`);
  }
  return res;
}
