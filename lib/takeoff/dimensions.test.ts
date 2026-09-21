import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMetricVolume,
  explicitRepeatedStoreyHeight,
  parseFiguredDimensionMm,
} from "./dimensions.ts";

test("storey height requires two explicit height references", () => {
  assert.equal(
    explicitRepeatedStoreyHeight(
      "Floor to ceiling height 2400mm. Ceiling height: 2400 mm.",
    ),
    2400,
  );
  assert.equal(
    explicitRepeatedStoreyHeight(
      "3018 3018 2735 2915 assorted horizontal plan dimensions",
    ),
    null,
  );
  assert.equal(explicitRepeatedStoreyHeight("Ceiling height 2400mm"), null);
});

test("derives volumes only from positive figured dimensions", () => {
  assert.equal(deriveMetricVolume(20, [600, 1000]), 12);
  assert.equal(deriveMetricVolume(50, [150]), 7.5);
  assert.equal(deriveMetricVolume(20, []), null);
  assert.equal(deriveMetricVolume(20, [0, 1000]), null);
});

test("normalises metric and imperial figured dimensions to millimetres", () => {
  assert.equal(parseFiguredDimensionMm("5400mm"), 5400);
  assert.equal(parseFiguredDimensionMm("44' - 0\""), 13411.2);
  assert.equal(parseFiguredDimensionMm("6' - 4 1/2\""), 1943.1);
  assert.equal(parseFiguredDimensionMm("6' - 13\""), null);
  assert.equal(parseFiguredDimensionMm("NTS"), null);
});
