import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('features/pricelist/components/AiNormalizationPanel.tsx','utf8');
const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name, context) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `Actual ${name} handler exists`);
  const js = ts.transpileModule(`var run = ${declaration};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return vm.runInNewContext(`${js}; run`, context);
}

test('actual upload handler resets pages only after a valid upload starts', async () => {
  let pages = { Supplier: 3, DPWH: 2 }, enqueued = 0;
  const context = {
    pendingFiles: [{ file:{ name:'prices.csv' } }], source:'DPWH', selectedSupplierId:null,
    quarter:'Q3', year:2026, setSupplierSelectionError() {}, setPendingFiles() {},
    setReviewPagesBySource(next) { pages=next; },
    enqueueFiles() { assert.equal(Object.keys(pages).length,0); enqueued++; },
  };
  await handler('handleUpload',context)();
  assert.equal(enqueued,1);
  pages={Supplier:3}; context.pendingFiles=[];
  await handler('handleUpload',context)();
  assert.equal(pages.Supplier,3);
  context.pendingFiles=[{file:{}}]; context.source='Supplier'; context.supplierMode='existing';
  await handler('handleUpload',context)();
  assert.equal(pages.Supplier,3);
  assert.equal(enqueued,1);
});
test('actual mapping confirmation resets pages only for complete mappings', () => {
  let pages={Supplier:4}, confirmed=0;
  const context={
    mappingItem:{id:'upload-1'}, mappingComplete:false,
    NORMALIZATION_FIELDS:['raw_name','raw_unit','raw_price'],
    mappingColumns:[{mapped_field:'raw_name',raw_column:'Name'},{mapped_field:'raw_unit',raw_column:'Unit'},{mapped_field:'raw_price',raw_column:'Price'}],
    setReviewPagesBySource(next) { pages=next; },
    resolveColumnMapping(id,mapping) { assert.equal(Object.keys(pages).length,0); assert.equal(id,'upload-1'); assert.equal(mapping.raw_price,'Price'); confirmed++; },
  };
  handler('handleConfirmMapping',context)();
  assert.equal(pages.Supplier,4);
  context.mappingComplete=true;
  handler('handleConfirmMapping',context)();
  assert.equal(confirmed,1);
});
