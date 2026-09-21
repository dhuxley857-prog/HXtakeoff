import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOpeningSchedules,
  reconcileOpening,
  roomsMatch,
} from "./schedules.ts";

test("parses window and door schedule evidence", () => {
  const rows = parseOpeningSchedules(
    [
      "W1 1050 x 1500 Sitting Room Stub No Clear Yes Casement",
      "D10 2'6\"( 802 ) Sitting Room No NO Blockwk",
    ],
    22,
  );
  assert.deepEqual(
    rows.map((r) => [r.tag, r.widthMm, r.heightMm, r.room]),
    [
      ["W1", 1050, 1500, "Sitting Room"],
      ["D10", 802, undefined, "Sitting Room"],
    ],
  );
  assert.equal(reconcileOpening("w 1", rows)?.page, 22);
});

test("coordinates schedule room aliases without matching unrelated rooms", () => {
  assert.equal(roomsMatch("Bed 2", "BEDROOM 2"), true);
  assert.equal(roomsMatch("Ensuite 1", "ENSUITE1"), true);
  assert.equal(roomsMatch("Kitchen / Dining", "Kitchen"), true);
  assert.equal(roomsMatch("Bedroom 2", "Bedroom 3"), false);
});
