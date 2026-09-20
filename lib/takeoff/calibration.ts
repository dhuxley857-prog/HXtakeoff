export type CalibrationEvidence = {
  id: string;
  figuredMm: number;
  drawnLength: number;
  page: number;
  drawing: string;
};
export type CalibrationResult = {
  valid: boolean;
  mmPerUnit: number | null;
  spreadPct: number;
  accepted: CalibrationEvidence[];
  rejected: CalibrationEvidence[];
  reason: string;
};

export function validateCalibration(
  rows: CalibrationEvidence[],
  tolerancePct = 1.5,
): CalibrationResult {
  const usable = rows.filter(
    (r) =>
      r.id &&
      r.figuredMm > 0 &&
      r.drawnLength > 0 &&
      Number.isFinite(r.figuredMm / r.drawnLength),
  );
  const unique = usable.filter(
    (r, i, a) => a.findIndex((x) => x.id === r.id) === i,
  );
  if (unique.length < 2)
    return {
      valid: false,
      mmPerUnit: null,
      spreadPct: Infinity,
      accepted: unique,
      rejected: usable.filter((r) => !unique.includes(r)),
      reason: "Two independent figured dimensions are required",
    };
  const scales = unique
      .map((r) => r.figuredMm / r.drawnLength)
      .sort((a, b) => a - b),
    median = scales[Math.floor(scales.length / 2)];
  const accepted = unique.filter(
      (r) =>
        (Math.abs(r.figuredMm / r.drawnLength - median) / median) * 100 <=
        tolerancePct,
    ),
    rejected = unique.filter((r) => !accepted.includes(r));
  if (accepted.length < 2)
    return {
      valid: false,
      mmPerUnit: null,
      spreadPct: Infinity,
      accepted,
      rejected,
      reason: "Figured dimensions do not independently agree",
    };
  const acceptedScales = accepted.map((r) => r.figuredMm / r.drawnLength),
    spread =
      ((Math.max(...acceptedScales) - Math.min(...acceptedScales)) / median) *
      100;
  return {
    valid: spread <= tolerancePct,
    mmPerUnit: spread <= tolerancePct ? median : null,
    spreadPct: spread,
    accepted,
    rejected,
    reason:
      spread <= tolerancePct
        ? `${accepted.length} independent figured dimensions agree within ${spread.toFixed(2)}%`
        : `Calibration spread ${spread.toFixed(2)}% exceeds ${tolerancePct}%`,
  };
}
