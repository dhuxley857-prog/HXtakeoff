export type PositionedText = { text: string; x: number; y: number };
export type OpeningScheduleRow = {
  kind: "door" | "window";
  tag: string;
  widthMm: number;
  heightMm?: number;
  room: string;
  page: number;
  document?: string;
  raw: string;
};

export function rowsFromPositionedText(
  items: PositionedText[],
  yTolerance = 2,
) {
  const groups: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let group = groups.find((g) => Math.abs(g[0].y - item.y) <= yTolerance);
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(item);
  }
  return groups
    .map((g) =>
      g
        .sort((a, b) => a.x - b.x)
        .map((x) => x.text.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
}

export function parseOpeningSchedules(
  lines: string[],
  page: number,
): OpeningScheduleRow[] {
  const out: OpeningScheduleRow[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    const window = line.match(
      /^W\s*(\d+[A-Z]?)\s+(\d{3,4})\s*[xX×]\s*(\d{3,4})\s+(.+?)(?:\s+(?:Stub|Std|Yes|No|Clear|Obsc|Casement|Roof|Rood)\b|$)/i,
    );
    if (window) {
      out.push({
        kind: "window",
        tag: `W${window[1].toUpperCase()}`,
        widthMm: Number(window[2]),
        heightMm: Number(window[3]),
        room: window[4].trim(),
        page,
        raw,
      });
      continue;
    }
    const door =
      line.match(
        /^D\s*(\d+[A-Z]?)\s+.*?\(\s*(\d{3,4})\s*\)\s+(.+?)(?:\s+(?:Yes|No)\b|$)/i,
      ) ||
      line.match(/^D\s*(\d+[A-Z]?)\s+(\d{3,4})\s+(.+?)(?:\s+(?:Yes|No)\b|$)/i);
    if (door)
      out.push({
        kind: "door",
        tag: `D${door[1].toUpperCase()}`,
        widthMm: Number(door[2]),
        room: door[3].trim(),
        page,
        raw,
      });
  }
  return out;
}

export function reconcileOpening(tag: string, rows: OpeningScheduleRow[]) {
  const normal = tag.toUpperCase().replace(/\s+/g, "");
  return rows.find((r) => r.tag === normal) || null;
}

export function roomsMatch(a: string, b: string) {
  const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/master\s*bed(?:room)?/, "master bedroom")
        .replace(/\bbed\s*(\d+)\b/, "bedroom $1")
        .replace(/\bensuite\s*(\d+)\b/, "ensuite $1")
        .replace(/[^a-z0-9]+/g, "")
        .trim(),
    left = normalize(a),
    right = normalize(b);
  return (
    !!left &&
    !!right &&
    (left === right || left.includes(right) || right.includes(left))
  );
}
