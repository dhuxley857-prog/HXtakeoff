import assert from "node:assert/strict";
import test from "node:test";
import {
  nearestPointOnSegment,
  segmentIntersection,
  snapPointToVectors,
} from "./snapping.ts";

test("projects a point onto a finite vector", () => {
  assert.deepEqual(
    nearestPointOnSegment({ x: 4, y: 3 }, { x1: 0, y1: 0, x2: 10, y2: 0 }),
    { x: 4, y: 0 },
  );
});

test("finds a true finite-segment intersection", () => {
  assert.deepEqual(
    segmentIntersection(
      { x1: 0, y1: 5, x2: 10, y2: 5 },
      { x1: 4, y1: 0, x2: 4, y2: 10 },
    ),
    { x: 4, y: 5 },
  );
});

test("prioritises an endpoint within the snap gate", () => {
  const result = snapPointToVectors(
    { x: 0.2, y: 0.15 },
    [{ x1: 0, y1: 0, x2: 10, y2: 0 }],
    0.5,
  );
  assert.equal(result?.kind, "endpoint");
  assert.deepEqual(result?.point, { x: 0, y: 0 });
});

test("snaps to an intersection when no endpoint is in range", () => {
  const result = snapPointToVectors(
    { x: 5.2, y: 5.15 },
    [
      { x1: 0, y1: 5, x2: 10, y2: 5 },
      { x1: 5, y1: 0, x2: 5, y2: 10 },
    ],
    0.5,
  );
  assert.equal(result?.kind, "intersection");
  assert.deepEqual(result?.point, { x: 5, y: 5 });
  assert.deepEqual(result?.segmentIndexes, [0, 1]);
});

test("uses a wall-line projection and rejects points outside tolerance", () => {
  const segment = { x1: 0, y1: 0, x2: 10, y2: 0 };
  assert.deepEqual(
    snapPointToVectors({ x: 5, y: 0.2 }, [segment], 0.5)?.point,
    { x: 5, y: 0 },
  );
  assert.equal(snapPointToVectors({ x: 5, y: 2 }, [segment], 0.5), null);
});
