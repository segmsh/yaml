import { assert, describe, it } from "vitest";
import eol from "eol";

import fs from "fs";
import path from "path";

import YamlProcessor from "../src/index.js";

const processor = new YamlProcessor();

function processAndCompare(filename: string) {
  const inDoc = fs.readFileSync(path.join("test", "fixtures", filename), {
    encoding: "utf-8",
  });

  const doc = processor.parse(inDoc);
  const docStr = JSON.stringify(doc);

  const outDoc = processor.stringify(doc);

  const outDocStructure = processor.parse(outDoc);
  const outDocStructureStr = JSON.stringify(outDocStructure);

  assert.equal(outDocStructureStr, docStr);
  console.log(filename);
}

function processAndCompareWithExpected(filename: string) {
  const inDoc = eol.lf(
    fs.readFileSync(path.join("test", "fixtures", filename), {
      encoding: "utf-8",
    }),
  );
  const inDocExpected = eol.lf(
    fs.readFileSync(path.join("test", "expected", filename), {
      encoding: "utf-8",
    }),
  );

  const doc = processor.parse(inDoc);
  const outDoc = processor.stringify(doc);

  assert.equal(outDoc, inDocExpected);
  console.log(filename);
}

describe("YamlProcessorTest", function () {
  describe("Expected Output Match", function () {
    const fixtures = [
      "preserve-spacing.yaml",
      "flow-map.yaml",
      "flow-root-sequence.yaml",
    ];

    fixtures.forEach((filename) => {
      it(`should match expected output for ${filename}`, function () {
        processAndCompareWithExpected(filename);
      });
    });
  });

  describe("Unique Segment IDs", function () {
    it("should generate distinct IDs for same text under different keys", function () {
      const yaml = [
        "section1:",
        '  title: "Hello"',
        "section2:",
        '  title: "Hello"',
      ].join("\n");

      const doc = processor.parse(yaml);
      const ids = doc.segments.map((s) => s.id);

      assert.equal(ids.length, new Set(ids).size, "segment IDs should be unique");
    });

    it("should include key path in segment metadata", function () {
      const yaml = [
        "parent:",
        "  child:",
        '    name: "value"',
      ].join("\n");

      const doc = processor.parse(yaml);
      const seg = doc.segments.find((s) => s.text === "value");

      assert.ok(seg, "segment should exist");
      assert.deepEqual(seg.metadata, { key: "parent.child.name" });
    });

    it("should handle deeply nested key paths", function () {
      const yaml = [
        "a:",
        "  b:",
        "    c:",
        "      d: deep",
      ].join("\n");

      const doc = processor.parse(yaml);
      const seg = doc.segments.find((s) => s.text === "deep");

      assert.ok(seg, "segment should exist");
      assert.deepEqual(seg.metadata, { key: "a.b.c.d" });
    });

    it("should include array indexes in key paths", function () {
      const yaml = [
        "items:",
        "  - title: Hello",
        "  - title: Hello",
      ].join("\n");

      const doc = processor.parse(yaml);
      const keys = doc.segments.map((s) => s.metadata?.key);

      assert.deepEqual(keys, ["items..0.title", "items..1.title"]);
      assert.equal(doc.segments[0].id === doc.segments[1].id, false);
    });
  });

  describe("Structure Identity", function () {
    const fixtures = [
      "comments.yaml",
      "flow.yaml",
      "paragraphs.yaml",
      "nested.yaml",
      "root-sequence.yaml",
    ];

    fixtures.forEach((filename) => {
      it(`should maintain structure for ${filename}`, function () {
        processAndCompare(filename);
      });
    });
  });
});
