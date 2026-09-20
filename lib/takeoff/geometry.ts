import { Point, MeasurementKind } from "./types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export function calculate(
  kind: MeasurementKind,
  p: Point[],
  mmPerUnit: number,
) {
  if (kind === "count") return p.length;
  if (kind === "length") {
    let u = 0;
    for (let i = 1; i < p.length; i++) u += distance(p[i - 1], p[i]);
    return (u * mmPerUnit) / 1000;
  }
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return (Math.abs(a / 2) * mmPerUnit * mmPerUnit) / 1e6;
}
export const variance = (expected: number, actual: number) =>
  expected ? (Math.abs(actual - expected) / expected) * 100 : 0;
