import { test } from "node:test";
import assert from "node:assert/strict";
import { mapItunesEpisode, mapPodcastIndexEpisode } from "../src/lib/sources/podcasts";
import { domainOf, mapTavilyResult } from "../src/lib/sources/tavily";

test("iTunes episode maps duration and source", () => {
  const m = mapItunesEpisode({ trackId: 9, trackName: "Ep", trackTimeMillis: 3_600_000, trackViewUrl: "https://x/y", collectionId: 5, collectionName: "Show", description: "<b>hi</b>" })!;
  assert.equal(m.durationSec, 3600);
  assert.equal(m.sourceExt, "it:5");
  assert.equal(m.description, "hi");
});

test("Podcast Index episode maps with feed info", () => {
  const m = mapPodcastIndexEpisode({ id: 1, title: "T", link: "https://ep", duration: 2400, datePublished: 1_700_000_000 }, { id: 7, title: "Feed", language: "en", image: "i.png" })!;
  assert.equal(m.durationSec, 2400);
  assert.equal(m.sourceName, "Feed");
  assert.equal(m.thumbnail, "i.png");
});

test("items without a link or title are dropped", () => {
  assert.equal(mapItunesEpisode({ trackName: "x" }), null);
  assert.equal(mapPodcastIndexEpisode({ title: "x" }, { id: 1, title: "F" }), null);
});

test("Tavily results map The Ken to its seeded source", () => {
  const m = mapTavilyResult({ title: "A story", url: "https://the-ken.com/story/abc", content: "snippet" }, "publication")!;
  assert.equal(m.sourceExt, "the-ken.com");
  assert.equal(m.sourceName, "The Ken");
  assert.equal(domainOf("https://www.example.com/x"), "example.com");
});
