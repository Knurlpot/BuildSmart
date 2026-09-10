import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Exercise the actual TypeScript sampler with the project's existing compiler.
const motionUrl = new URL("../features/welcome/skyline/skyline-motion.ts", import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(motionUrl, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
});
const context = { exports: {}, require: createRequire(motionUrl) };
vm.runInNewContext(compiled.outputText, context);
const { SKYLINE_PARTS, SKYLINE_GROUPS, sampleSkylineScene, sampleBuilding, skylinePaintOrder } = context.exports;

test("skyline softens through the middle and regains definition at the bottom", () => {
  assert.equal(sampleSkylineScene(0, 1440).blur, 0);
  assert.ok(sampleSkylineScene(0.2, 1440).blur > 0);
  assert.equal(sampleSkylineScene(0.5, 1440).blur, 4);
  assert.equal(sampleSkylineScene(1, 1440).blur, 0);
  assert.equal(sampleSkylineScene(0.5, 1440, true).blur, 0);
});

test("featured landmarks render above occluding scenery with corresponding reflection order", () => {
  for (const reflection of [false, true]) {
    const parts = skylinePaintOrder(reflection);
    assert.equal(parts.length, 98);
    assert.equal(new Set(parts.map(part => part.sourceIndex)).size, 98);
    const position = id => parts.findIndex(part => part.group.id === id);
    assert.ok(position('foreground-45') > position('foreground-48'));
    assert.ok(position('foreground-49') > position('foreground-51'));
    assert.ok(position('foreground-58') > position('foreground-59'));
    assert.ok(position('foreground-88') > position('foreground-45'));
  }
});

test("middle skyline is nearly invisible until the bottom composition returns", () => {
  for (const p of [0.35, 0.5, 0.6, 0.65]) {
    assert.ok(sampleSkylineScene(p, 1440).atmosphere < 0.015);
  }
  assert.ok(sampleSkylineScene(1, 1440).atmosphere > 0.5);
});

test("all 197 original vector paths and blend wrappers survive in painter order", () => {
  const svg = fs.readFileSync(new URL("../design-reference/skyline-full.svg", import.meta.url), "utf8");
  const elements = [...svg.matchAll(/<g\b[^>]*>[\s\S]*?<\/g>|<path\b[^>]*\/>/g)].map(([element]) => element);
  assert.equal(elements.length, 197);
  assert.equal(SKYLINE_PARTS.length, elements.length);
  for (const [index, element] of elements.entries()) {
    const part = SKYLINE_PARTS[index];
    assert.equal(part.sourceIndex, index);
    assert.equal(part.d, element.match(/\bd="([^"]*)"/)[1]);
    assert.equal(part.fill, element.match(/\bfill="([^"]*)"/)[1]);
    assert.equal(part.grouped, element.startsWith("<g"));
    assert.equal(part.hardLight, element.includes("mix-blend-mode:hard-light"));
    assert.equal(part.opacity, element.startsWith("<g") ? 0.5 : 1);
  }
});

test("logical groups cover each upright and reflected part exactly once", () => {
  assert.equal(SKYLINE_GROUPS.filter((group) => group.tower).length, 21);
  const mapped = SKYLINE_GROUPS.flatMap((group) => [...group.sourceIndices, ...group.reflectionIndices]);
  assert.equal(mapped.length, 196);
  assert.equal(new Set(mapped).size, 196);
  assert.equal(Math.min(...mapped), 0);
  assert.equal(Math.max(...mapped), 195);
  assert.equal(SKYLINE_PARTS[196].group, undefined);
  for (const group of SKYLINE_GROUPS) {
    group.sourceIndices.forEach((sourceIndex, index) => {
      const reflected = SKYLINE_PARTS[group.reflectionIndices[index]];
      assert.equal(reflected.group.id, group.id);
      assert.equal(reflected.fill, SKYLINE_PARTS[sourceIndex].fill);
      assert.equal(reflected.reflection, true);
    });
  }
  for (let i = 19; i <= 28; i++) assert.equal(SKYLINE_PARTS[i].group.id, SKYLINE_PARTS[31].group.id);
  for (const [crown, trunk] of [[88, 95], [90, 96], [94, 97]]) {
    assert.equal(SKYLINE_PARTS[crown].group.id, SKYLINE_PARTS[trunk].group.id);
  }
});

test("towers keep original end positions and compress independently, including on mobile", () => {
  for (const group of SKYLINE_GROUPS.filter((group) => group.tower)) {
    for (const progress of [0, 1]) {
      const state = sampleBuilding(group, sampleSkylineScene(progress, 1440));
      assert.equal(Math.abs(state.x), 0);
      assert.equal(Math.abs(state.y), 0);
    }
    const middle = sampleBuilding(group, sampleSkylineScene(0.4, 1440));
    const mobile = sampleBuilding(group, sampleSkylineScene(0.4, 390));
    assert.ok(Math.abs(group.centerX + middle.x - 1482.5) < Math.abs(group.centerX - 1482.5));
    assert.ok(Math.abs(mobile.x) < Math.abs(middle.x));
  }
});

test("foreground/reflection reveal follows the requested late scroll windows", () => {
  assert.equal(sampleSkylineScene(0.65, 1440).foreground, 0);
  assert.equal(sampleSkylineScene(0.8, 1440).foreground, 1);
  assert.equal(sampleSkylineScene(0.8, 1440).reflection, 0);
  assert.equal(sampleSkylineScene(1, 1440).reflection, 1);
  assert.equal(sampleSkylineScene(0.35, 1440).compression, 1);
  assert.equal(sampleSkylineScene(0.5, 1440).compression, 1);
  for (const progress of [0.35, 0.5, 0.65, 0.8]) {
    const before = sampleSkylineScene(progress - 0.00001, 1440);
    const after = sampleSkylineScene(progress + 0.00001, 1440);
    for (const key of ["compression", "foreground", "reflection", "atmosphere"]) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.001, `continuous ${key} at ${progress}`);
    }
  }
});

test("reduced motion is a stable dispersed scene at every scroll position", () => {
  for (const group of SKYLINE_GROUPS) {
    const first = sampleBuilding(group, sampleSkylineScene(0, 1440, true));
    for (const progress of [0.4, 0.7, 1]) {
      const current = sampleBuilding(group, sampleSkylineScene(progress, 1440, true));
      assert.deepEqual(current, first);
      assert.equal(Math.abs(current.x), 0);
      assert.equal(Math.abs(current.y), 0);
    }
  }
});
