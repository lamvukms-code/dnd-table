import { sheetFromPdfFields, type PdfField, type PdfSheetResult } from '@dnd-table/shared';

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
  return res;
}
