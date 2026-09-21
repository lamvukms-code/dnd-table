// Dump the fillable fields (name, value, page, rectangle) of a PDF character sheet to JSON — for mapping a new template.
//   node scripts/dump-pdf-fields.mjs "<sheet>.pdf" out.json   (the output holds the sheet's text: keep it out of git)
import fs from 'node:fs';
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';
const file = process.argv[2];
const doc = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
const pages = doc.getPages();
const out = [];
for (const f of doc.getForm().getFields()) {
  let value, checked;
  if (f instanceof PDFTextField) value = f.getText() ?? undefined;
  else if (f instanceof PDFCheckBox) checked = f.isChecked();
  else continue;
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle();
    out.push({ name: f.getName(), value, checked, page: pages.findIndex((p) => p.ref === w.P()), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(out.length, 'fields; pages', pages.length);
