import { test } from "node:test";
import assert from "node:assert/strict";
import { sourcePenalty } from "../src/lib/rules";

test("one or two dislikes never lower a source", () => {
  assert.equal(sourcePenalty(0, 1), 0);
  assert.equal(sourcePenalty(0, 2), 0);
});

test("3 dislikes with more dislikes than loves lowers the source by 2", () => {
  assert.equal(sourcePenalty(0, 3), 2);
  assert.equal(sourcePenalty(2, 3), 2);
  assert.equal(sourcePenalty(0, 7), 2);
});

test("dislikes that do not outnumber loves never lower a source", () => {
  assert.equal(sourcePenalty(3, 3), 0);
  assert.equal(sourcePenalty(5, 4), 0);
});
