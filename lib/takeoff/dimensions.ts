export function explicitRepeatedStoreyHeight(text: string) {
  const normalized = text.replace(/\s+/g, " "),
    values = [
      ...normalized.matchAll(
        /(?:floor\s*to\s*ceiling|ceiling\s*height|storey\s*height|story\s*height)[^\d]{0,40}(\d{4})\s*(?:mm)?/gi,
      ),
      ...normalized.matchAll(
        /(\d{4})\s*(?:mm)?[^\d]{0,40}(?:floor\s*to\s*ceiling|ceiling\s*height|storey\s*height|story\s*height)/gi,
      ),
    ]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 2100 && value <= 4000),
    counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return (
    [...counts]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || null
  );
}

export function deriveMetricVolume(baseMetric: number, dimensionsMm: number[]) {
  if (
    !Number.isFinite(baseMetric) ||
    baseMetric <= 0 ||
    !dimensionsMm.length ||
    dimensionsMm.some(
      (dimension) => !Number.isFinite(dimension) || dimension <= 0,
    )
  )
    return null;
  return dimensionsMm.reduce(
    (quantity, dimension) => quantity * (dimension / 1000),
    baseMetric,
  );
}

export function parseFiguredDimensionMm(value: string) {
  const normalized = value
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
  const metric = normalized.match(/^(\d{3,5})(?:\s*mm)?$/i);
  if (metric) return Number(metric[1]);
  const imperial = normalized.match(
    /^(\d+)\s*'\s*-?\s*(\d+)?(?:\s+(\d+)\s*\/\s*(\d+))?\s*"?$/,
  );
  if (!imperial) return null;
  const feet = Number(imperial[1]),
    inches = Number(imperial[2] || 0),
    numerator = Number(imperial[3] || 0),
    denominator = Number(imperial[4] || 1);
  if (inches >= 12 || denominator <= 0 || numerator >= denominator) return null;
  return Number(
    ((feet * 12 + inches + numerator / denominator) * 25.4).toFixed(3),
  );
}
