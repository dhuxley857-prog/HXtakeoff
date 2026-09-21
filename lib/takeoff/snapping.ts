export type SnapPoint = { x: number; y: number };

export type SnapSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SnapResult = {
  point: SnapPoint;
  kind: "endpoint" | "intersection" | "projection";
  distance: number;
  segmentIndexes: number[];
};

const distance = (a: SnapPoint, b: SnapPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function nearestPointOnSegment(
  point: SnapPoint,
  segment: SnapSegment,
): SnapPoint {
  const dx = segment.x2 - segment.x1,
    dy = segment.y2 - segment.y1,
    denominator = dx * dx + dy * dy;
  if (denominator === 0) return { x: segment.x1, y: segment.y1 };
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / denominator,
    ),
  );
  return { x: segment.x1 + t * dx, y: segment.y1 + t * dy };
}

export function segmentIntersection(
  first: SnapSegment,
  second: SnapSegment,
): SnapPoint | null {
  const r = { x: first.x2 - first.x1, y: first.y2 - first.y1 },
    s = { x: second.x2 - second.x1, y: second.y2 - second.y1 },
    cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < 1e-9) return null;
  const q = { x: second.x1 - first.x1, y: second.y1 - first.y1 },
    t = (q.x * s.y - q.y * s.x) / cross,
    u = (q.x * r.y - q.y * r.x) / cross;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  return { x: first.x1 + t * r.x, y: first.y1 + t * r.y };
}

export function snapPointToVectors(
  point: SnapPoint,
  segments: SnapSegment[],
  tolerance: number,
): SnapResult | null {
  if (!segments.length || tolerance <= 0) return null;
  const nearby = segments
    .map((segment, index) => {
      const projected = nearestPointOnSegment(point, segment);
      return {
        segment,
        index,
        projected,
        distance: distance(point, projected),
      };
    })
    .filter((candidate) => candidate.distance <= tolerance * 1.5)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 24);

  const endpoints: SnapResult[] = nearby.flatMap(({ segment, index }) =>
    [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    ]
      .map((candidate) => ({
        point: candidate,
        kind: "endpoint" as const,
        distance: distance(point, candidate),
        segmentIndexes: [index],
      }))
      .filter((candidate) => candidate.distance <= tolerance),
  );
  const intersections: SnapResult[] = [];
  for (let i = 0; i < nearby.length; i++) {
    for (let j = i + 1; j < nearby.length; j++) {
      const intersection = segmentIntersection(
        nearby[i].segment,
        nearby[j].segment,
      );
      if (!intersection) continue;
      const gap = distance(point, intersection);
      if (gap <= tolerance)
        intersections.push({
          point: intersection,
          kind: "intersection",
          distance: gap,
          segmentIndexes: [nearby[i].index, nearby[j].index],
        });
    }
  }
  const projections: SnapResult[] = nearby
    .filter((candidate) => candidate.distance <= tolerance)
    .map((candidate) => ({
      point: candidate.projected,
      kind: "projection",
      distance: candidate.distance,
      segmentIndexes: [candidate.index],
    }));

  for (const group of [endpoints, intersections, projections]) {
    const best = group.sort((a, b) => a.distance - b.distance)[0];
    if (best) return best;
  }
  return null;
}
