/** 2024 Exhaustion stepper (0–6): −2 × level to d20 tests, −5 ft × level Speed, 6 = death. */
export function ExhaustionStepper({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  const v = Math.max(0, Math.min(6, value ?? 0));
  return (
    <span className={`exhaustion ${v ? 'on' : ''}`} title="Exhaustion (2024): mỗi cấp −2 vào mọi d20 test và −5 ft speed; cấp 6 là chết. Nghỉ dài giảm 1 cấp.">
      Exhaustion
      <button className="link" disabled={v <= 0} onClick={() => onChange(v - 1)}>
        −
      </button>
      <strong>{v}</strong>
      <button className="link" disabled={v >= 6} onClick={() => onChange(v + 1)}>
        +
      </button>
      {v > 0 && v < 6 && <span className="hint">d20 −{2 * v}, speed −{5 * v} ft</span>}
      {v >= 6 && <span className="hint danger">💀 chết</span>}
    </span>
  );
}
