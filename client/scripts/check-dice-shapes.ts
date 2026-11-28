// Sanity check for src/dice3d/shapes.ts: face counts, values 1..n, and that every symmetry turn
// really lands the wanted number on top (plus a control: a plain shortest turn must fail somewhere).
//   npx tsx client/scripts/check-dice-shapes.ts
import { Quaternion } from 'three';
import { dieShape, symmetriesTo, upFeature, type Sides } from '../src/dice3d/shapes.js';

const want: Record<Sides, number> = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 20: 20 };
let bad = 0;
for (const sides of [4, 6, 8, 10, 12, 20] as Sides[]) {
  const s = dieShape(sides);
  const faces = s.faces.length;
  const vals = [...s.values].sort((a, b) => a - b).join(',');
  const okVals = vals === Array.from({ length: sides }, (_, i) => i + 1).join(',');
  const okFaces = sides === 4 ? faces === 4 : faces === want[sides];
  let symFail = 0;
  let plainFail = 0;
  // a resting pose: some feature points up
  for (let to = 0; to < s.features.length; to++) {
    const rest = new Quaternion().setFromUnitVectors(s.features[to], { x: 0, y: 1, z: 0 } as never);
    for (let from = 0; from < s.features.length; from++) {
      for (const q of symmetriesTo(s, from, to)) {
        if (upFeature(s, rest.clone().multiply(q)) !== from) symFail++;
        // is q a real symmetry? every vertex lands on a vertex
        const isSym = s.vertices.every((p) => s.vertices.some((o) => o.distanceToSquared(p.clone().applyQuaternion(q)) < 1e-4));
        if (!isSym) symFail++;
      }
      const plain = new Quaternion().setFromUnitVectors(s.features[from], s.features[to]);
      if (!s.vertices.every((p) => s.vertices.some((o) => o.distanceToSquared(p.clone().applyQuaternion(plain)) < 1e-4))) plainFail++;
    }
  }
  const ok = okVals && okFaces && symFail === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} d${sides}: ${faces} mặt, giá trị ${okVals ? 'đủ 1..' + sides : vals}, xoay đối xứng lỗi ${symFail} (${symmetriesTo(s, 0, 0).length} cách/mặt), (đối chứng: xoay ngắn nhất không phải đối xứng ${plainFail} lần)`);
}
process.exit(bad ? 1 : 0);
