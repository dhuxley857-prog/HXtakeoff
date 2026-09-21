import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMetricVolume,
  explicitRepeatedStoreyHeight,
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
