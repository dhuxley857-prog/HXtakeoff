import test from "node:test";
import assert from "node:assert/strict";
import {
  bridgeCollinearGaps,
  buildClosedTopology,
  netFacadeArea,
  netPerimeter,
  netWallArea,
  selectExternalFace,
  selectRoomPolygon,
  type Segment,
  type TopologyPolygon,
} from "./topology.ts";
import { validateCalibration } from "./calibration.ts";

const loop = (points: { x: number; y: number }[]): Segment[] =>
  points.map((p, i) => ({ a: p, b: points[(i + 1) % points.length] }));
test("closed topology measures an L-shaped room", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 2 },
    { x: 3, y: 2 },
    { x: 3, y: 5 },
    { x: 0, y: 5 },
  ];
  const faces = buildClosedTopology(loop(points), { snapTolerance: 0.01 });
  const room = selectRoomPolygon(faces, { x: 1, y: 1 });
  assert.ok(room);
  assert.equal(room.area, 21);
  assert.equal(room.perimeter, 22);
});
test("small endpoint gaps snap closed", () => {
  const segments: Segment[] = [
    { a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
    { a: { x: 5.08, y: 0 }, b: { x: 5, y: 4 } },
    { a: { x: 5, y: 4 }, b: { x: 0, y: 4 } },
    { a: { x: 0, y: 4 }, b: { x: 0, y: 0.06 } },
  ];
  const faces = buildClosedTopology(segments, { snapTolerance: 0.1 });
  assert.equal(faces.length, 1);
  assert.ok(Math.abs(faces[0].area - 20) < 0.3);
});
test("door-sized collinear gaps can be closed as explicit topology evidence", () => {
  const segments: Segment[] = [
    { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
    { a: { x: 3, y: 0 }, b: { x: 5, y: 0 } },
    { a: { x: 5, y: 0 }, b: { x: 5, y: 4 } },
    { a: { x: 5, y: 4 }, b: { x: 0, y: 4 } },
    { a: { x: 0, y: 4 }, b: { x: 0, y: 0 } },
  ];
  const faces = buildClosedTopology(
    bridgeCollinearGaps(segments, { maxGap: 1.1 }),
    { snapTolerance: 0.01 },
  );
  assert.equal(faces[0].area, 20);
});
test("deductions never invent negative quantities", () => {
  assert.equal(netPerimeter(20, [0.9, 0.8]), 18.3);
  assert.equal(netWallArea(20, 2.4, [{ width: 0.9, height: 2.1 }]), 46.11);
  assert.equal(netFacadeArea(50, [{ width: 1, height: 1.5, count: 4 }]), 44);
});
test("calibration requires independent agreeing figured dimensions", () => {
  const one = validateCalibration([
    { id: "D1", figuredMm: 9000, drawnLength: 90, page: 1, drawing: "A" },
  ]);
  assert.equal(one.valid, false);
  const two = validateCalibration([
    { id: "D1", figuredMm: 9000, drawnLength: 90, page: 1, drawing: "A" },
    { id: "D2", figuredMm: 5400, drawnLength: 54.1, page: 1, drawing: "A" },
  ]);
  assert.equal(two.valid, true);
  assert.ok(two.mmPerUnit && Math.abs(two.mmPerUnit - 100) < 0.2);
});

test("external face requires room-label coverage and rejects oversized borders", () => {
  const labels = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 2, y: 8 },
      { x: 8, y: 8 },
    ],
    rectangle = (id: string, size: number): TopologyPolygon => ({
      id,
      points: [
        { x: 0, y: 0 },
        { x: size, y: 0 },
        { x: size, y: size },
        { x: 0, y: size },
      ],
      area: size * size,
      perimeter: size * 4,
    }),
    selected = selectExternalFace(
      [
        rectangle("room", 5),
        rectangle("building", 10),
        rectangle("border", 50),
      ],
      labels,
      { minArea: 30, maxArea: 500, minLabelCoverage: 0.7 },
    );
  assert.equal(selected?.polygon.id, "building");
  assert.equal(selected?.enclosedLabels.length, 4);
});
