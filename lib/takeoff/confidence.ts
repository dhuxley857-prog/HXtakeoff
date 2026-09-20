export type Signals = {
  vectorGeometry: boolean;
  tagMatched: boolean;
  specMatched: boolean;
  scaleValidated: boolean;
  dimensionValidated: boolean;
  scheduleMatched: boolean;
};
export function evidenceConfidence(s: Signals) {
  const weights = {
    vectorGeometry: 25,
    tagMatched: 15,
    specMatched: 15,
    scaleValidated: 20,
    dimensionValidated: 15,
    scheduleMatched: 10,
  };
  let score = 0;
  (Object.keys(weights) as (keyof Signals)[]).forEach((k) => {
    if (s[k]) score += weights[k];
  });
  return {
    score,
    status: score >= 85 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW",
  };
}
