import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const signatures = new Map();
// The authentication-only install defines the final deployable RPC contract.
{
  const sql = readFileSync(new URL("../supabase/auth_only.sql", import.meta.url), "utf8");
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/gi)) {
    const args = [...match[2].matchAll(/\b(p_\w+)\s+[^,]+/g)].map((param) => ({
      name: param[1], optional: /\bdefault\b/i.test(param[0]),
    }));
    signatures.set(match[1], args);
  }
}

const files = ["lib/auth/actions.ts", "lib/auth/activation.ts", "lib/auth/dal.ts"];

for (const filename of files) {
  test(`${filename}: RPC names and supplied keys match final SQL contracts`, () => {
    const source = ts.createSourceFile(filename, readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest, true);
    let calls = 0;
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "rpc" && ts.isStringLiteral(node.arguments[0])) {
        calls++;
        const name = node.arguments[0].text;
        assert.equal(signatures.has(name), true, `${name} is missing from migrations`);
        const parameters = signatures.get(name);
        const input = node.arguments[1];
        // Lease arguments are shared by auth calls; resolve the known local literal.
        const resolve = (arg) => {
          if (!arg) return [];
          if (ts.isIdentifier(arg) && arg.text === "args") {
            return ["p_employee_id", "p_claim_token"];
          }
          assert.equal(ts.isObjectLiteralExpression(arg), true, `Unresolved RPC arguments for ${name}`);
          return arg.properties.flatMap((prop) => {
            if (ts.isSpreadAssignment(prop)) return resolve(prop.expression);
            return [prop.name.text];
          });
        };
        const keys = resolve(input);
        assert.equal(new Set(keys).size, keys.length, `${name}: duplicate argument`);
        for (const key of keys) assert.equal(parameters.some((p) => p.name === key), true, `${name}: unknown ${key}`);
        for (const parameter of parameters.filter((p) => !p.optional)) {
          assert.equal(keys.includes(parameter.name), true, `${name}: missing ${parameter.name}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(calls > 0, "No RPC calls were checked");
  });
}
