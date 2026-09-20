import type { Point } from "./types";
import type { Segment } from "./topology";

type Matrix = [number, number, number, number, number, number];
const multiply = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const apply = (p: Point, m: Matrix): Point => ({
  x: p.x * m[0] + p.y * m[2] + m[4],
  y: p.x * m[1] + p.y * m[3] + m[5],
});

export function extractPdfLineSegments(
  fnArray: number[],
  argsArray: any[],
  ops: {
    save: number;
    restore: number;
    transform: number;
    constructPath: number;
    setStrokeRGBColor?: number;
    setFillRGBColor?: number;
    setLineWidth?: number;
  },
  convert: (x: number, y: number) => [number, number],
): Segment[] {
  let ctm: Matrix = [1, 0, 0, 1, 0, 0],
    stack: Matrix[] = [],
    segments: Segment[] = [],
    stroke = "#000000",
    fill = "#000000",
    lineWidth = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i],
      args = argsArray[i];
    if (fn === ops.save) {
      stack.push([...ctm] as Matrix);
      continue;
    }
    if (fn === ops.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === ops.transform) {
      ctm = multiply(ctm, args as Matrix);
      continue;
    }
    if (ops.setStrokeRGBColor !== undefined && fn === ops.setStrokeRGBColor) {
      stroke = String(Array.isArray(args) ? args[0] : args);
      continue;
    }
    if (ops.setFillRGBColor !== undefined && fn === ops.setFillRGBColor) {
      fill = String(Array.isArray(args) ? args[0] : args);
      continue;
    }
    if (ops.setLineWidth !== undefined && fn === ops.setLineWidth) {
      lineWidth = Number(args?.[0] ?? 0);
      continue;
    }
    if (fn !== ops.constructPath) continue;
    const chunks = Array.isArray(args?.[1]) ? args[1] : [],
      source = `stroke=${stroke};fill=${fill};width=${lineWidth};paint=${args?.[0]}`;
    for (const chunk of chunks) {
      let cursor = 0,
        current: Point | null = null,
        start: Point | null = null;
      while (cursor < chunk.length) {
        const op = chunk[cursor++];
        if (op === 0) {
          current = apply({ x: chunk[cursor++], y: chunk[cursor++] }, ctm);
          start = current;
        } else if (op === 1) {
          const next = apply({ x: chunk[cursor++], y: chunk[cursor++] }, ctm);
          if (current) {
            const a = convert(current.x, current.y),
              b = convert(next.x, next.y);
            segments.push({
              a: { x: a[0], y: a[1] },
              b: { x: b[0], y: b[1] },
              source,
            });
          }
          current = next;
        } else if (op === 2) {
          cursor += 4;
          const next = apply({ x: chunk[cursor++], y: chunk[cursor++] }, ctm);
          current = next;
        } else if (op === 3) {
          cursor += 2;
          const next = apply({ x: chunk[cursor++], y: chunk[cursor++] }, ctm);
          current = next;
        } else if (op === 4) {
          if (current && start && !samePoint(current, start)) {
            const a = convert(current.x, current.y),
              b = convert(start.x, start.y);
            segments.push({
              a: { x: a[0], y: a[1] },
              b: { x: b[0], y: b[1] },
              source,
            });
          }
          current = start;
        } else break;
      }
    }
  }
  return segments.filter(
    (s) =>
      Number.isFinite(s.a.x) &&
      Number.isFinite(s.a.y) &&
      Number.isFinite(s.b.x) &&
      Number.isFinite(s.b.y) &&
      Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 1e-5,
  );
}
const samePoint = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
