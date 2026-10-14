import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
const mod = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/ui/dialog-focus.ts", import.meta.url), "utf8"),
 { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
 { module: mod, exports: mod.exports });
const { handleDialogKey } = mod.exports;

test("dialog keyboard focus wraps both ways and skips hidden controls", () => {
 let focused;
 const first = { tabIndex: 0, matches: () => false, getClientRects: () => [1], focus: () => { focused = "first"; } };
 const hidden = { tabIndex: 0, matches: () => false, getClientRects: () => [], focus: () => assert.fail("hidden control focused") };
 const last = { tabIndex: 0, matches: () => false, getClientRects: () => [1], focus: () => { focused = "last"; } };
 const disabled = { tabIndex: 0, matches: () => true, getClientRects: () => [1], focus: () => assert.fail("disabled control focused") };
 const panel = { querySelectorAll: () => [first, hidden, last, disabled], contains: e => [first, last].includes(e), focus() {} };
 let prevented = false;
 const event = shiftKey => ({ key: "Tab", shiftKey, preventDefault() { prevented = true; } });
 handleDialogKey(event(false), panel, last, () => assert.fail("closed"));
 assert.equal(focused, "first"); assert.equal(prevented, true);
 handleDialogKey(event(true), panel, first, () => assert.fail("closed"));
 assert.equal(focused, "last");
 handleDialogKey(event(false), panel, panel, () => assert.fail("closed"));
 assert.equal(focused, "first");
});

test("dialog handles empty content and Escape", () => {
 let focused = false; let closed = false; let prevented = false;
 const panel = { querySelectorAll: () => [], focus() { focused = true; } };
 handleDialogKey({ key: "Tab", preventDefault() { prevented = true; } }, panel, null, () => {});
 assert.equal(focused, true); assert.equal(prevented, true);
 handleDialogKey({ key: "Escape", preventDefault() {} }, null, null, () => { closed = true; });
 assert.equal(closed, true);
});
