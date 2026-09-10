import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const component = new URL('../features/welcome/BrickLogo.tsx', import.meta.url);
const require = createRequire(component);
const context = { exports: {}, require: name => name.endsWith('.css') ? {} : require(name) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(component, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
const { brickKeyframes, LOGO_CYCLE_MS } = context.exports;
const bricks = JSON.parse(fs.readFileSync(new URL('../features/welcome/logo-bricks.json', import.meta.url)));

test('all 72 bricks reuse exact sign-up paths, colors and stage order', () => {
  const generated = JSON.parse(execFileSync(process.execPath, ['scripts/generate-logo-bricks.mjs'], { encoding: 'utf8' }));
  assert.deepEqual(bricks, generated);
  assert.equal(bricks.length, 72);
  assert.equal(new Set(bricks.map(brick => brick.order)).size, 72);
});
test('brick timelines build, hold, fade together and reset invisibly', () => {
  assert.equal(LOGO_CYCLE_MS, 12000);
  for (const brick of bricks) {
    const frames = brickKeyframes(brick.order);
    assert.equal(frames[0].opacity, 0);
    assert.equal(frames.at(-1).opacity, 0);
    assert.ok(frames[2].offset < 0.4);
    assert.equal(frames[3].offset, 0.74);
    assert.equal(frames[4].offset, 0.86);
    assert.equal(frames[3].opacity, 1);
    assert.ok(frames.every((frame, i) => i === 0 || frame.offset > frames[i - 1].offset));
  }
});
