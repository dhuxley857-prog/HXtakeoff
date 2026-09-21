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
