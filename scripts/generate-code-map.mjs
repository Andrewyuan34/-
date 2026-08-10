import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderCodeMap, renderSymbolIndex } from "./repository-architecture.mjs";

export const GENERATED_CODE_MAP = "docs/generated/CODEMAP.md";
export const GENERATED_SYMBOL_INDEX = "docs/generated/SYMBOLS.md";

function normalizeNewlines(value) {
  return value.replaceAll("\r\n", "\n");
}

export function writeCodeMap(repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot);
  const destination = path.join(root, GENERATED_CODE_MAP);
  const symbolDestination = path.join(root, GENERATED_SYMBOL_INDEX);
  const output = renderCodeMap(root);
  const symbols = renderSymbolIndex(root);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, output, "utf8");
  writeFileSync(symbolDestination, symbols, "utf8");
  return { destination, output, symbolDestination, symbols };
}

export function checkCodeMap(repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot);
  const destination = path.join(root, GENERATED_CODE_MAP);
  const symbolDestination = path.join(root, GENERATED_SYMBOL_INDEX);
  const expected = normalizeNewlines(renderCodeMap(root));
  const expectedSymbols = normalizeNewlines(renderSymbolIndex(root));
  let actual;
  let actualSymbols;
  try {
    actual = normalizeNewlines(readFileSync(destination, "utf8"));
    actualSymbols = normalizeNewlines(readFileSync(symbolDestination, "utf8"));
  } catch {
    return { current: false, destination, symbolDestination, reason: "missing" };
  }
  return {
    current: actual === expected && actualSymbols === expectedSymbols,
    destination,
    symbolDestination,
    reason: actual === expected && actualSymbols === expectedSymbols ? "current" : "stale",
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const checkOnly = process.argv.includes("--check");
  const stdout = process.argv.includes("--stdout");
  if (stdout) {
    process.stdout.write(
      process.argv.includes("--symbols")
        ? renderSymbolIndex(process.cwd())
        : renderCodeMap(process.cwd()),
    );
  } else if (checkOnly) {
    const result = checkCodeMap(process.cwd());
    if (!result.current) {
      console.error(
        `${GENERATED_CODE_MAP} is ${result.reason}. Run \`npm run context:map\` and commit the result.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`code map current: ${GENERATED_CODE_MAP}, ${GENERATED_SYMBOL_INDEX}`);
    }
  } else {
    const result = writeCodeMap(process.cwd());
    console.log(
      `code map generated: ${path.relative(process.cwd(), result.destination)}, ` +
        path.relative(process.cwd(), result.symbolDestination),
    );
  }
}
