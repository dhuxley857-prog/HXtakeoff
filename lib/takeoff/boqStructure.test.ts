import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRoomInstances,
  externalRows,
  preliminariesRows,
  roomScopeRows,
  seedBoqRows,
  sortBoqRows,
} from "./boqStructure.ts";

test("BOQ starts with detailed preliminaries followed by external work", () => {
  const rows = seedBoqRows();
  assert.equal(preliminariesRows().length, 15);
  assert.equal(externalRows().length, 16);
  assert.ok(rows.slice(0, 15).every((row) => row.section === "PRELIMINARIES"));
  assert.ok(rows.slice(15).every((row) => row.section === "EXTERNAL"));
  assert.ok(
    rows.every(
      (row) => row.qty === 0 && /no quantity assumed/i.test(row.evidence),
    ),
  );
});

test("every room receives common trades and relevant specialist trades", () => {
  const rows = roomScopeRows([
    "Reception Room",
    "Kitchen",
    "Bathroom",
    "Landing",
  ]);
  for (const room of ["Reception Room", "Kitchen", "Bathroom", "Landing"])
    assert.ok(
      rows.some((row) => row.room === room && row.item === "Floor finish"),
    );
  assert.ok(
    rows.some(
      (row) => row.room === "Kitchen" && /Kitchen units/.test(row.item),
    ),
  );
  assert.ok(
    rows.some(
      (row) => row.room === "Bathroom" && /Sanitaryware/.test(row.item),
    ),
  );
  assert.ok(
    rows.some((row) => row.room === "Landing" && /Staircase/.test(row.item)),
  );
  assert.ok(
    !rows.some(
      (row) => row.room === "Reception Room" && /Sanitaryware/.test(row.item),
    ),
  );
});

test("duplicate drawing labels become distinct deterministic room instances", () => {
  const labels = canonicalRoomInstances([
    { text: "BEDROOM", x: 70, y: 20 },
    { text: "BEDROOM", x: 40, y: 50 },
    { text: "KITCHEN", x: 10, y: 10 },
    { text: "BEDROOM", x: 40, y: 10 },
  ]);
  assert.deepEqual(
    labels.map((label) => label.text),
    ["BEDROOM 3", "BEDROOM 2", "KITCHEN", "BEDROOM 1"],
  );
});

test("sorting keeps preliminaries, external work and room scopes in hierarchy", () => {
  const rows = sortBoqRows([
    ...roomScopeRows(["Kitchen"]),
    ...externalRows(),
    ...preliminariesRows(),
  ]);
  assert.equal(rows[0].section, "PRELIMINARIES");
  assert.equal(rows[15].section, "EXTERNAL");
  assert.equal(rows.at(-1)?.section, "ROOM");
});
