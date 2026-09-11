import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const context = { exports: {}, Buffer, File, FormData, Response, Request, console: { error() {} }, require: name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name === '@/lib/image-upload-policy') return policy;
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const policy = load('lib/image-upload-policy.ts');
const images = load('lib/server/image-upload.ts');
const file = (bytes, type = 'image/png') => new File([bytes], 'untrusted-name.svg', { type });
const sample = () => sharp({ create: { width: 8, height: 5, channels: 4, background: '#ed802e80' } }).png().toBuffer();

test('browser/server policy agrees on formats, zero bytes and 5 MB boundary', () => {
  assert.equal(policy.imageFileError({ type: 'image/png', size: policy.MAX_IMAGE_BYTES }), null);
  for (const value of [{ type: 'image/svg+xml', size: 12 }, { type: 'image/gif', size: 12 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: policy.MAX_IMAGE_BYTES + 1 }]) assert.ok(policy.imageFileError(value));
});
test('real PNG/JPEG decode and re-encode; retain transparency and remove metadata/trailing bytes', async () => {
  const png = await sample();
  const prepared = await images.prepareImage(file(Buffer.concat([png, Buffer.from('<script>bad</script>')])));
  assert.equal(prepared.extension, 'png');
  assert.equal(prepared.bytes.includes(Buffer.from('<script>')), false);
  assert.equal((await sharp(prepared.bytes).metadata()).hasAlpha, true);
  const jpg = await sharp(png).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const clean = await images.prepareImage(file(jpg, 'image/jpeg'));
  const meta = await sharp(clean.bytes).metadata();
  assert.equal(clean.extension, 'jpg');
  assert.equal(meta.width, 5);
  assert.equal(meta.height, 8);
  assert.equal(meta.exif, undefined);
});
test('rejects SVG disguised as PNG, incorrect MIME and truncated files with valid signatures', async () => {
  const png = await sample();
  for (const value of [file('<svg></svg>'), file(png, 'image/jpeg'), file(png.subarray(0, 30)), file(Buffer.from([255,216,255]), 'image/jpeg')]) {
    await assert.rejects(images.prepareImage(value), error => error instanceof images.ImageUploadError);
  }
});
test('rejects excessive pixel counts and excessively wide images', async () => {
  for (const [width, height] of [[4001,4000],[8193,1]]) {
    const png = await sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer();
    await assert.rejects(images.prepareImage(file(png)), error => error instanceof images.ImageUploadError);
  }
});
test('bounded multipart parser handles valid, missing, duplicate and malformed files', async () => {
  const data = new FormData(); data.append('file', file(await sample()));
  const request = body => new Request('http://localhost/upload', { method: 'POST', body });
  assert.equal((await images.readImageFile(request(data))).type, 'image/png');
  await assert.rejects(images.readImageFile(request(new FormData())));
  data.append('file', file(await sample()));
  await assert.rejects(images.readImageFile(request(data)));
  await assert.rejects(images.readImageFile(new Request('http://localhost/upload', { method:'POST', headers:{'content-type':'multipart/form-data; boundary=x'}, body:'broken' })));
});
test('stream body limit works without trusting Content-Length', async () => {
  let cancelled = false;
  const request = new Request('http://localhost/upload', { method: 'POST', duplex: 'half', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }) });
  await assert.rejects(images.readImageFile(request), error => error.status === 413);
  assert.equal(cancelled, true);
});

test('routes reject unauthenticated/non-owner users before any file work', async () => {
  let session = null, owner = { user_role:'Estimator', company_id:1 }, saves = 0;
  const mocks = {
    '@/lib/server/session': { readSession: () => session },
    '@/lib/server/db': { pool: { query: async () => ({ rows: owner ? [owner] : [] }) } },
    '@/lib/server/image-upload': { ImageUploadError: images.ImageUploadError, storeImage: async () => { saves++; return '/uploads/company-logos/test.png'; } },
  };
  const company = load('app/api/uploads/company-logo/route.ts', mocks);
  const profile = load('app/api/uploads/profile-picture/route.ts', mocks);
  assert.equal((await company.POST({})).status, 401);
  assert.equal((await profile.POST({})).status, 401);
  session = { userId: 1 };
  assert.equal((await company.POST({})).status, 403);
  owner = null;
  assert.equal((await company.POST({})).status, 403);
  assert.equal(saves, 0);
  owner = { user_role:'Owner', company_id:1 };
  assert.equal((await company.POST({})).status, 201);
  assert.equal((await profile.POST({})).status, 201);
  assert.equal(saves, 2);
});
test('routes return safe validation errors and conceal unexpected exception details', async () => {
  let failure = new images.ImageUploadError('Image is too large.', 413);
  const route = load('app/api/uploads/profile-picture/route.ts', {
    '@/lib/server/session': { readSession: () => ({ userId:1 }) },
    '@/lib/server/image-upload': { ImageUploadError: images.ImageUploadError, storeImage: async () => { throw failure; } },
  });
  assert.equal((await route.POST({})).status, 413);
  failure = new Error('private database password / filesystem path');
  const result = await route.POST({});
  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), /password|filesystem/);
});
