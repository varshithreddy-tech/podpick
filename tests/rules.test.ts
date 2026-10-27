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

import { shortlistCandidates } from "../src/lib/rules";
const vid = (id: number, topics: string[], views: number, format = "watch") => ({ id, format, topic_tags: topics, mood_tags: [] as string[], views });

test("together: items fitting both topics come first", () => {
  const items = [vid(1, ["A"], 9_000_000), vid(2, ["B"], 5_000), vid(3, ["A", "B"], 100)];
  const out = shortlistCandidates(items, [{ topic: "A", mood: null }, { topic: "B", mood: null }], 10);
  assert.equal(out[0].id, 3);
});

test("together: a popular topic does not crowd out the niche one", () => {
  const popular = Array.from({ length: 50 }, (_, i) => vid(100 + i, ["A"], 1_000_000 - i));
  const niche = Array.from({ length: 10 }, (_, i) => vid(200 + i, ["B"], 1_000 - i));
  const out = shortlistCandidates([...popular, ...niche], [{ topic: "A", mood: null }, { topic: "B", mood: null }], 20);
  assert.equal(out.length, 20);
  assert.equal(out.filter((c) => c.topic_tags[0] === "B").length, 10);
});

test("solo: keeps the most viewed items that match the topic", () => {
  const items = [vid(1, ["A"], 10), vid(2, ["A"], 99), vid(3, ["B"], 5000)];
  const out = shortlistCandidates(items, [{ topic: "A", mood: null }], 2);
  assert.deepEqual(out.map((c) => c.id), [2, 1, 3].slice(0, out.length));
});

test("formats stay balanced", () => {
  const items = [...Array.from({ length: 30 }, (_, i) => vid(i, ["A"], 1000 - i)), ...Array.from({ length: 5 }, (_, i) => vid(100 + i, ["A"], 0, "listen"))];
  const out = shortlistCandidates(items, [{ topic: "A", mood: null }], 10);
  assert.equal(out.filter((c) => c.format === "listen").length, 5);
});
