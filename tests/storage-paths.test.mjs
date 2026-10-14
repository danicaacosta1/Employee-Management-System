import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/supabase/storage-paths.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { documentPath, isDocumentPath, UUID_PATTERN } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const owner = "11111111-1111-4111-8111-111111111111";

test("server-generated document keys stay in the authenticated owner's folder", () => {
  for (const name of ["report.pdf", "../../evidence.pdf", "", "測試.png", "a".repeat(400) + ".jpg"]) {
    const path = documentPath(owner, name);
    assert.equal(isDocumentPath(path), true);
    assert.equal(path.split("/")[0], owner);
    assert.equal(path.split("/").length, 2);
  }
  assert.notEqual(documentPath(owner, "same.pdf"), documentPath(owner, "same.pdf"));
});

test("document paths reject traversal, nested folders, arbitrary keys and malformed UUIDs", () => {
  for (const path of [null, "", "../file.pdf", `${owner}/../file.pdf`, `${owner}/file.pdf`,
    `${owner}/11111111-1111-4111-8111-111111111111-file.pdf/other`,
    `${owner}/11111111-1111-4111-8111-111111111111-file%2f.pdf`]) {
    assert.equal(isDocumentPath(path), false);
  }
  assert.equal(UUID_PATTERN.test("------------------------------------"), false);
  assert.throws(() => documentPath("../other-user", "file.pdf"), /Invalid storage owner/);
});
