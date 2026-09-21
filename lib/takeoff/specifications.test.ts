import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySpecificationClause,
  formatSpecificationRef,
} from "./specifications.ts";

test("structures specification clauses into traceable systems", () => {
  const wall = classifySpecificationClause(
    "21.4 External wall: facing brickwork with full-fill insulation.",
    "Specification.pdf",
    18,
  );
  assert.equal(wall.system, "external-wall");
  assert.equal(wall.clauseRef, "21.4");
  assert.equal(
    formatSpecificationRef(wall),
    "Specification.pdf P18 §21.4 [external-wall]",
  );
  assert.equal(
    classifySpecificationClause("Rainwater downpipes to elevations", "A.pdf", 4)
      .system,
    "rainwater",
  );
});
