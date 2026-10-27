import { test } from "node:test";
import assert from "node:assert/strict";
import { similarity } from "../src/lib/highlights";

test("a clip of the same conversation matches the episode title", () => {
  const ep = "Dropout To Billionaire - Zerodha's Founder Nikhil Kamath's Journey To SUCCESS";
  assert.ok(similarity(ep, "Nikhil Kamath on dropping out and becoming a billionaire") >= 0.3);
});

test("an unrelated video does not match", () => {
  assert.ok(similarity("Building a bootstrapped startup with the Noise founder", "Best pasta recipes for dinner tonight") < 0.3);
});

test("empty or tiny titles score zero", () => {
  assert.equal(similarity("", "anything here"), 0);
  assert.equal(similarity("a b c", "d e f"), 0);
});

import { keywords } from "../src/lib/highlights";
test("keywords keeps the guest and topic words in order", () => {
  assert.equal(keywords("Shobana Kamineni: The Apollo Builder Behind 3 Healthcare Unicorns"), "shobana kamineni apollo builder behind");
});

import { related } from "../src/lib/highlights";
test("a clip sharing only one word is not related", () => {
  assert.equal(related("Shobana Kamineni: The Apollo Builder Behind 3 Healthcare Unicorns", "APOLLO HOSPITAL - ROAD TVC"), false);
});
test("a clip naming the same guest and company is related", () => {
  assert.equal(related("Shobana Kamineni: The Apollo Builder Behind 3 Healthcare Unicorns", "Shobana Kamineni on building Apollo"), true);
});
