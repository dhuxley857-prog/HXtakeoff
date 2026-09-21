import type { Point } from "./types";

export type Segment = { a: Point; b: Point; source?: string };
export type TopologyPolygon = {
  id: string;
  points: Point[];
  area: number;
  perimeter: number;
};

const key = (p: Point, t: number) =>
  `${Math.round(p.x / t)},${Math.round(p.y / t)}`;
const same = (a: Point, b: Point, t: number) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= t;
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function polygonSignedArea(points: Point[]) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    a += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return a / 2;
}
export function polygonArea(points: Point[]) {
  return Math.abs(polygonSignedArea(points));
}
export function polygonPerimeter(points: Point[]) {
  let n = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    n += Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
  }
  return n;
}
export function simplifyPolygon(points: Point[], tolerance = 0.1) {
  if (points.length <= 3) return [...points];
  let simplified = [...points],
    changed = true;
  while (changed && simplified.length > 3) {
    changed = false;
    const next: Point[] = [];
    for (let i = 0; i < simplified.length; i++) {
      const previous =
          simplified[(i - 1 + simplified.length) % simplified.length],
        point = simplified[i],
        following = simplified[(i + 1) % simplified.length],
        dx = following.x - previous.x,
        dy = following.y - previous.y,
        length = Math.hypot(dx, dy),
        distance =
          length > 0
            ? Math.abs(
                dy * point.x -
                  dx * point.y +
                  following.x * previous.y -
                  following.y * previous.x,
              ) / length
            : Math.hypot(point.x - previous.x, point.y - previous.y),
        between =
          (point.x - previous.x) * (point.x - following.x) +
            (point.y - previous.y) * (point.y - following.y) <=
          tolerance * tolerance;
      if (distance <= tolerance && between) {
        changed = true;
        continue;
      }
      next.push(point);
    }
    simplified = next.length >= 3 ? next : simplified;
  }
  return simplified;
}
export function removePolygonSpurs(points: Point[], tolerance = 0.05) {
  const cleanLinear = (input: Point[]) => {
    let cleaned = [...input],
      changed = true;
    while (changed && cleaned.length > 3) {
      changed = false;
      outer: for (let i = 0; i < cleaned.length; i++)
        for (let j = i + 2; j < cleaned.length; j++) {
          if (!same(cleaned[i], cleaned[j], tolerance)) continue;
          const loop = cleaned.slice(i, j + 1);
          if (polygonArea(loop) > tolerance * tolerance * 4) continue;
          cleaned = [...cleaned.slice(0, i + 1), ...cleaned.slice(j + 1)];
          changed = true;
          break outer;
        }
    }
    return cleaned;
  };
  let best = cleanLinear(points);
  for (let offset = 1; offset < points.length; offset++) {
    const rotated = [...points.slice(offset), ...points.slice(0, offset)],
      candidate = cleanLinear(rotated);
    if (candidate.length < best.length) best = candidate;
  }
  return best;
}

export function isSimplePolygon(points: Point[], tolerance = 1e-6) {
  if (points.length < 3) return false;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
      if (!adjacent && same(points[i], points[j], tolerance)) return false;
    }
  for (let i = 0; i < points.length; i++) {
    const a: Segment = { a: points[i], b: points[(i + 1) % points.length] };
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const b: Segment = { a: points[j], b: points[(j + 1) % points.length] };
      if (intersection(a, b, tolerance)) return false;
    }
  }
  return true;
}
export function roomTopologyPasses(options: {
  area: number;
  maximumArea: number;
  vertices: number;
  compactness: number;
  supportedVertexRatio: number;
  enclosedLabels: number;
  openPlanPair: boolean;
}) {
  return (
    options.area >= 2.5 &&
    options.area <= options.maximumArea &&
    options.vertices <= 16 &&
    options.compactness <= 55 &&
    options.supportedVertexRatio >= 0.8 &&
    (options.enclosedLabels <= 1 || options.openPlanPair)
  );
}
export function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      Math.abs(cross(a, b, point)) < 1e-8 &&
      point.x >= Math.min(a.x, b.x) - 1e-8 &&
      point.x <= Math.max(a.x, b.x) + 1e-8 &&
      point.y >= Math.min(a.y, b.y) - 1e-8 &&
      point.y <= Math.max(a.y, b.y) + 1e-8
    )
      return true;
    const hit =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function intersection(a: Segment, b: Segment, tolerance: number) {
  const x1 = a.a.x,
    y1 = a.a.y,
    x2 = a.b.x,
    y2 = a.b.y,
    x3 = b.a.x,
    y3 = b.a.y,
    x4 = b.b.x,
    y4 = b.b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-10) return null;
  const px =
      ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den,
    py =
      ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  const within = (v: number, a: number, b: number) =>
    v >= Math.min(a, b) - tolerance && v <= Math.max(a, b) + tolerance;
  return within(px, x1, x2) &&
    within(py, y1, y2) &&
    within(px, x3, x4) &&
    within(py, y3, y4)
    ? { x: px, y: py }
    : null;
}

function splitSegments(input: Segment[], tolerance: number) {
  const out: Segment[] = [];
  for (let i = 0; i < input.length; i++) {
    const s = input[i],
      pts = [s.a, s.b];
    for (let j = 0; j < input.length; j++) {
      if (i === j) continue;
      const p = intersection(s, input[j], tolerance);
      if (p && !same(p, s.a, tolerance) && !same(p, s.b, tolerance))
        pts.push(p);
    }
    const dx = s.b.x - s.a.x,
      dy = s.b.y - s.a.y;
    pts.sort(
      (p, q) =>
        (p.x - s.a.x) * dx +
        (p.y - s.a.y) * dy -
        ((q.x - s.a.x) * dx + (q.y - s.a.y) * dy),
    );
    for (let n = 1; n < pts.length; n++)
      if (!same(pts[n - 1], pts[n], tolerance))
        out.push({ a: pts[n - 1], b: pts[n], source: s.source });
  }
  return out;
}

export function closeSmallGaps(input: Segment[], tolerance = 0.35) {
  const points = input.flatMap((s) => [s.a, s.b]),
    parent = points.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (same(points[i], points[j], tolerance)) {
        const a = root(i),
          b = root(j);
        if (a !== b) parent[b] = a;
      }
  const clusters = new Map<number, Point[]>();
  points.forEach((p, i) => {
    const r = root(i),
      bucket = clusters.get(r) || [];
    bucket.push(p);
    clusters.set(r, bucket);
  });
  const centres = new Map<number, Point>();
  for (const [r, ps] of clusters)
    centres.set(r, {
      x: ps.reduce((n, p) => n + p.x, 0) / ps.length,
      y: ps.reduce((n, p) => n + p.y, 0) / ps.length,
    });
  let cursor = 0;
  return input
    .map((s) => {
      const a = centres.get(root(cursor++))!,
        b = centres.get(root(cursor++))!;
      return { a, b, source: s.source };
    })
    .filter((s) => !same(s.a, s.b, tolerance / 5));
}

export function bridgeCollinearGaps(
  input: Segment[],
  options: {
    axisTolerance?: number;
    maxGap?: number;
    maxGapX?: number;
    maxGapY?: number;
  } = {},
) {
  const axis = options.axisTolerance ?? 0.12,
    maxGap = options.maxGap ?? 5,
    maxGapX = options.maxGapX ?? maxGap,
    maxGapY = options.maxGapY ?? maxGap,
    out = [...input],
    seen = new Set<string>();
  for (let i = 0; i < input.length; i++)
    for (let j = i + 1; j < input.length; j++) {
      const a = input[i],
        b = input[j],
        ah = Math.abs(a.a.y - a.b.y) <= axis,
        bh = Math.abs(b.a.y - b.b.y) <= axis,
        av = Math.abs(a.a.x - a.b.x) <= axis,
        bv = Math.abs(b.a.x - b.b.x) <= axis;
      let p: Point | null = null,
        q: Point | null = null;
      if (ah && bh && Math.abs((a.a.y + a.b.y - b.a.y - b.b.y) / 2) <= axis) {
        const ar = [a.a.x, a.b.x].sort((x, y) => x - y),
          br = [b.a.x, b.b.x].sort((x, y) => x - y),
          gap =
            br[0] > ar[1]
              ? [ar[1], br[0]]
              : ar[0] > br[1]
                ? [br[1], ar[0]]
                : null;
        if (gap && gap[1] - gap[0] <= maxGapX) {
          const y = (a.a.y + a.b.y + b.a.y + b.b.y) / 4;
          p = { x: gap[0], y };
          q = { x: gap[1], y };
        }
      } else if (
        av &&
        bv &&
        Math.abs((a.a.x + a.b.x - b.a.x - b.b.x) / 2) <= axis
      ) {
        const ar = [a.a.y, a.b.y].sort((x, y) => x - y),
          br = [b.a.y, b.b.y].sort((x, y) => x - y),
          gap =
            br[0] > ar[1]
              ? [ar[1], br[0]]
              : ar[0] > br[1]
                ? [br[1], ar[0]]
                : null;
        if (gap && gap[1] - gap[0] <= maxGapY) {
          const x = (a.a.x + a.b.x + b.a.x + b.b.x) / 4;
          p = { x, y: gap[0] };
          q = { x, y: gap[1] };
        }
      }
      if (p && q) {
        const id = `${key(p, axis)}>${key(q, axis)}`;
        if (!seen.has(id)) {
          seen.add(id);
          out.push({ a: p, b: q, source: "inferred-opening-closure" });
        }
      }
    }
  return out;
}

export function buildClosedTopology(
  input: Segment[],
  options: { snapTolerance?: number; minArea?: number; maxArea?: number } = {},
): TopologyPolygon[] {
  const tolerance = options.snapTolerance ?? 0.25,
    minArea = options.minArea ?? 1e-4,
    maxArea = options.maxArea ?? Infinity;
  const segments = splitSegments(
    closeSmallGaps(input, tolerance),
    tolerance / 4,
  );
  const nodes = new Map<string, { point: Point; neighbours: Set<string> }>();
  const add = (p: Point) => {
    const k = key(p, tolerance);
    if (!nodes.has(k)) nodes.set(k, { point: p, neighbours: new Set() });
    return k;
  };
  for (const s of segments) {
    const a = add(s.a),
      b = add(s.b);
    if (a !== b) {
      nodes.get(a)!.neighbours.add(b);
      nodes.get(b)!.neighbours.add(a);
    }
  }
  const used = new Set<string>(),
    found: TopologyPolygon[] = [];
  const canonical = (ids: string[]) => {
    const rots = ids.map((_, i) =>
      [...ids.slice(i), ...ids.slice(0, i)].join("|"),
    );
    const rev = [...ids].reverse();
    rots.push(
      ...rev.map((_, i) => [...rev.slice(i), ...rev.slice(0, i)].join("|")),
    );
    return rots.sort()[0];
  };
  const seen = new Set<string>();
  for (const [from, node] of nodes)
    for (const to of node.neighbours) {
      const start = `${from}>${to}`;
      if (used.has(start)) continue;
      const cycle: string[] = [];
      let u = from,
        v = to,
        guard = 0;
      while (guard++ < nodes.size * 3) {
        used.add(`${u}>${v}`);
        cycle.push(u);
        const at = nodes.get(v);
        if (!at) break;
        const neighbours = [...at.neighbours].sort((a, b) => {
          const pa = nodes.get(a)!.point,
            pb = nodes.get(b)!.point;
          return (
            Math.atan2(pa.y - at.point.y, pa.x - at.point.x) -
            Math.atan2(pb.y - at.point.y, pb.x - at.point.x)
          );
        });
        const back = neighbours.indexOf(u);
        if (back < 0) break;
        const w =
          neighbours[(back - 1 + neighbours.length) % neighbours.length];
        u = v;
        v = w;
        if (u === from && v === to) break;
      }
      if (!(u === from && v === to) || cycle.length < 3) continue;
      const id = canonical(cycle);
      if (seen.has(id)) continue;
      const points = cycle.map((k) => nodes.get(k)!.point),
        area = polygonArea(points);
      if (area < minArea || area > maxArea) continue;
      seen.add(id);
      found.push({
        id: `TOP-${found.length + 1}`,
        points,
        area,
        perimeter: polygonPerimeter(points),
      });
    }
  return found.sort((a, b) => a.area - b.area);
}

export function selectRoomPolygon(
  polygons: TopologyPolygon[],
  label: Point,
  options: { minArea?: number; maxArea?: number } = {},
) {
  const min = options.minArea ?? 0,
    max = options.maxArea ?? Infinity;
  return (
    polygons
      .filter(
        (p) =>
          p.area >= min && p.area <= max && pointInPolygon(label, p.points),
      )
      .sort((a, b) => a.area - b.area)[0] || null
  );
}

export function selectExternalFace(
  polygons: TopologyPolygon[],
  labels: Point[],
  options: {
    areaOf?: (polygon: TopologyPolygon) => number;
    perimeterOf?: (polygon: TopologyPolygon) => number;
    minArea?: number;
    maxArea?: number;
    minLabelCoverage?: number;
    maxVertices?: number;
    maxCompactness?: number;
  } = {},
) {
  if (labels.length < 2) return null;
  const areaOf = options.areaOf || ((polygon) => polygon.area),
    perimeterOf = options.perimeterOf || ((polygon) => polygon.perimeter),
    minimumLabels = Math.max(
      2,
      Math.ceil(labels.length * (options.minLabelCoverage ?? 0.7)),
    ),
    candidates = polygons
      .map((polygon) => {
        const area = areaOf(polygon),
          perimeter = perimeterOf(polygon),
          enclosedLabels = labels.filter((label) =>
            pointInPolygon(label, polygon.points),
          ),
          compactness = area > 0 ? (perimeter * perimeter) / area : Infinity;
        return { polygon, area, perimeter, enclosedLabels, compactness };
      })
      .filter(
        (candidate) =>
          candidate.area >= (options.minArea ?? 0) &&
          candidate.area <= (options.maxArea ?? Infinity) &&
          candidate.polygon.points.length <=
            (options.maxVertices ?? Infinity) &&
          candidate.compactness <= (options.maxCompactness ?? Infinity) &&
          candidate.enclosedLabels.length >= minimumLabels,
      )
      .sort((a, b) => b.area - a.area);
  return candidates[0] || null;
}

export function netPerimeter(gross: number, openingWidths: number[]) {
  return Math.max(
    0,
    gross -
      openingWidths
        .filter((v) => Number.isFinite(v) && v > 0)
        .reduce((a, b) => a + b, 0),
  );
}
export function netWallArea(
  perimeter: number,
  height: number,
  openings: { width: number; height: number }[],
) {
  return Math.max(
    0,
    perimeter * height -
      openings
        .filter((o) => o.width > 0 && o.height > 0)
        .reduce((n, o) => n + o.width * o.height, 0),
  );
}
export function netFacadeArea(
  gross: number,
  openings: { width: number; height: number; count?: number }[],
) {
  return Math.max(
    0,
    gross -
      openings
        .filter((o) => o.width > 0 && o.height > 0)
        .reduce((n, o) => n + o.width * o.height * (o.count ?? 1), 0),
  );
}
