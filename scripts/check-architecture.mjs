import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeArchitecture,
  formatArchitectureViolations,
} from "./repository-architecture.mjs";

export function checkArchitecture(repoRoot = process.cwd()) {
  const result = analyzeArchitecture(repoRoot);
  return {
    checks: result.checks,
    violations: result.violations,
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const result = checkArchitecture(process.cwd());
  if (result.violations.length > 0) {
    console.error(formatArchitectureViolations(result.violations));
    console.error(
      `architecture check failed: ${result.violations.length} violation(s) across ${result.checks.length} contracts`,
    );
    process.exitCode = 1;
  } else {
    console.log(`architecture check passed: ${result.checks.length} contracts`);
  }
}
