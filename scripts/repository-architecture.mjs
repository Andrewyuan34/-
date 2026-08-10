import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const SOURCE_ROOTS = ["app", "components", "lib", "scripts", "tests", "worker"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "outputs",
]);

export const ARCHITECTURE_AREAS = Object.freeze({
  "simulation-kernel":
    "team planners plus the deterministic fixed-step world and motion resolver",
  "team-strategy":
    "team-owned strategy registration and scoring after hard feasibility",
  "input-domain": "stable input-domain contracts shared by the runtime",
  "scenario-adapter": "UI/test presets translated into public initial conditions",
  "frozen-input": "versioned manifests and deterministic audit samples",
  audit: "phase-specific audit, replay, and evidence generation",
  "observation-ui": "all-knowing but read-only visualization and inspection",
  "runtime-entry": "application or worker entrypoints; no basketball decisions",
  tooling: "deterministic repository maps and executable architecture checks",
  verification: "tests and shared verification harnesses",
  support: "supporting library code not assigned to a narrower area",
});

export const ARCHITECTURE_CHECKS = Object.freeze([
  "source parse validity for trustworthy generated maps",
  "runtime dependency direction and cycle freedom",
  "kernel dependency allowlist",
  "planner observation and world-state privacy",
  "team-private plan and strategy isolation",
  "neutral resolver separation from candidate scoring",
  "fixed 1/60 second clock",
  "deterministic, headless kernel APIs",
  "outcome-neutral simulation configuration",
]);

let cachedTypeScript;

function loadTypeScript(repoRoot) {
  if (cachedTypeScript) return cachedTypeScript;

  try {
    cachedTypeScript = createRequire(import.meta.url)("typescript");
    return cachedTypeScript;
  } catch (localError) {
    try {
      const projectRequire = createRequire(path.join(repoRoot, "package.json"));
      cachedTypeScript = projectRequire("typescript");
      return cachedTypeScript;
    } catch (projectError) {
      throw new Error(
        "TypeScript is required for repository analysis. Run npm install first. " +
          `(${localError.message}; ${projectError.message})`,
      );
    }
  }
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativePath(repoRoot, filePath) {
  return normalizePath(path.relative(repoRoot, filePath));
}

function scriptKindFor(ts, filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function discoverSourceFiles(repoRoot) {
  const discovered = [];

  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        discovered.push(absolute);
      }
    }
  }

  for (const root of SOURCE_ROOTS) walk(path.join(repoRoot, root));
  return discovered.sort((left, right) =>
    normalizePath(left).localeCompare(normalizePath(right), "en"),
  );
}

function hasModifier(ts, node, modifierKind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === modifierKind));
}

function declarationRange(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { start, end, lines: end - start + 1 };
}

function variableName(declaration, sourceFile) {
  return declaration.name?.getText(sourceFile) ?? "<anonymous>";
}

function collectTopLevelDeclarations(ts, sourceFile) {
  const declarations = [];

  for (const statement of sourceFile.statements) {
    const exported =
      hasModifier(ts, statement, ts.SyntaxKind.ExportKeyword) ||
      hasModifier(ts, statement, ts.SyntaxKind.DefaultKeyword);

    if (ts.isVariableStatement(statement)) {
      const kind =
        statement.declarationList.flags & ts.NodeFlags.Const
          ? "const"
          : statement.declarationList.flags & ts.NodeFlags.Let
            ? "let"
            : "var";
      for (const declaration of statement.declarationList.declarations) {
        declarations.push({
          name: variableName(declaration, sourceFile),
          kind,
          exported,
          node: declaration,
          ...declarationRange(sourceFile, statement),
        });
      }
      continue;
    }

    const supported =
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement);
    if (!supported) continue;

    const kind = ts.isFunctionDeclaration(statement)
      ? "function"
      : ts.isClassDeclaration(statement)
        ? "class"
        : ts.isInterfaceDeclaration(statement)
          ? "interface"
          : ts.isTypeAliasDeclaration(statement)
            ? "type"
            : "enum";
    declarations.push({
      name: statement.name?.getText(sourceFile) ?? "default",
      kind,
      exported,
      node: statement,
      ...declarationRange(sourceFile, statement),
    });
  }

  return declarations;
}

function importClauseIsTypeOnly(ts, node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.length > 0 &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly);
  }
  return false;
}

function collectRawImports(ts, sourceFile) {
  const imports = [];

  function add(specifier, typeOnly, node, kind) {
    imports.push({
      specifier,
      typeOnly,
      kind,
      node,
      line: declarationRange(sourceFile, node).start,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(
        node.moduleSpecifier.text,
        importClauseIsTypeOnly(ts, node),
        node,
        "import",
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text, Boolean(node.isTypeOnly), node, "re-export");
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        add(argument.literal.text, true, node, "import-type");
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const first = node.arguments[0];
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteralLike(first)
      ) {
        add(first.text, false, node, "dynamic-import");
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        ts.isStringLiteralLike(first)
      ) {
        add(first.text, false, node, "require");
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

function resolveInternalImport(repoRoot, importer, specifier, sourcePaths) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(repoRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(path.join(repoRoot, importer)), specifier);
  } else {
    return null;
  }

  const candidates = [base];
  if (!SOURCE_EXTENSIONS.includes(path.extname(base).toLowerCase())) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`));
  }

  for (const candidate of candidates) {
    const relative = relativePath(repoRoot, candidate);
    if (sourcePaths.has(relative)) return relative;
  }
  return null;
}

export function classifyFile(file) {
  if (file.startsWith("tests/")) return "verification";
  if (file.startsWith("scripts/")) return "tooling";
  if (file.startsWith("components/")) return "observation-ui";
  if (file.startsWith("app/") || file.startsWith("worker/")) return "runtime-entry";
  if (file === "lib/pnr-core.ts" || file.startsWith("lib/pnr-core/")) {
    return "simulation-kernel";
  }
  if (file === "lib/pnr-strategy.ts" || file.startsWith("lib/pnr-strategy/")) {
    return "team-strategy";
  }
  if (file === "lib/pnr-formation-domain.ts") return "input-domain";
  if (file === "lib/pnr-scenarios.ts") return "scenario-adapter";
  if (/manifest|samples/.test(file)) return "frozen-input";
  if (
    /audit|generalization|results|pnr-g\d|pnr-p\d|pnr-f\d|pnr-a\d|pnr-under/.test(file)
  ) {
    return "audit";
  }
  return "support";
}

export function phaseTagsForFile(file) {
  const tags = [];
  const basename = path.posix.basename(file);
  if (file === "lib/pnr-core.ts") tags.push("Core");
  if (/pnr-g\d|generalization|GProbe/.test(basename)) tags.push("G");
  if (/pnr-p\d|policy|Policy/.test(basename)) tags.push("P");
  if (/pnr-f\d|formation|Formation/.test(basename)) tags.push("F");
  if (/pnr-a\d|autonomous|Autonomous/.test(basename)) tags.push("A");
  if (/tactical|Tactical/.test(basename)) tags.push("T");
  if (/pnr-v\d|validation|Validation/.test(basename)) tags.push("V");
  if (file.startsWith("components/") || file.startsWith("app/")) tags.push("UI");
  if (file.startsWith("tests/")) tags.push("Test");
  return tags.length > 0 ? tags : ["Shared"];
}

export function buildRepositoryModel(repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot);
  const ts = loadTypeScript(root);
  const absoluteFiles = discoverSourceFiles(root);
  const sourcePaths = new Set(absoluteFiles.map((file) => relativePath(root, file)));
  const files = absoluteFiles.map((absolute) => {
    const file = relativePath(root, absolute);
    const text = readFileSync(absolute, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(ts, file),
    );
    const declarations = collectTopLevelDeclarations(ts, sourceFile);
    const imports = collectRawImports(ts, sourceFile).map((entry) => ({
      ...entry,
      target: resolveInternalImport(root, file, entry.specifier, sourcePaths),
    }));
    return {
      absolute,
      file,
      text,
      bytes: Buffer.byteLength(text, "utf8"),
      lines: sourceFile.getLineStarts().length,
      area: classifyFile(file),
      phaseTags: phaseTagsForFile(file),
      declarations,
      imports,
      parseDiagnostics: sourceFile.parseDiagnostics,
      sourceFile,
    };
  });

  return {
    root,
    ts,
    files,
    byPath: new Map(files.map((file) => [file.file, file])),
  };
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function groupedInternalImports(file, typeOnly) {
  return [...new Set(
    file.imports
      .filter((entry) => entry.target && entry.typeOnly === typeOnly)
      .map((entry) => entry.target),
  )].sort((left, right) => left.localeCompare(right, "en"));
}

export function renderCodeMap(repoRoot = process.cwd()) {
  const model = buildRepositoryModel(repoRoot);
  const output = [];
  const declarationCount = model.files.reduce(
    (total, file) => total + file.declarations.length,
    0,
  );
  const runtimeEdges = model.files.flatMap((file) =>
    groupedInternalImports(file, false).map((target) => ({ from: file.file, target })),
  );
  const typeEdges = model.files.flatMap((file) =>
    groupedInternalImports(file, true).map((target) => ({ from: file.file, target })),
  );

  output.push(
    "# Generated Code Map",
    "",
    "> Generated by `npm run context:map`. Do not edit by hand.",
    "> Use this file for module ownership and dependencies. Query `docs/generated/SYMBOLS.md` by symbol instead of reading it end to end.",
    "",
    "## Repository summary",
    "",
    `- Source modules: ${model.files.length}`,
    `- Top-level declarations: ${declarationCount}`,
    `- Runtime dependency edges: ${runtimeEdges.length}`,
    `- Type-only dependency edges: ${typeEdges.length}`,
    "",
    "## Responsibility areas",
    "",
    "| Area | Modules | Responsibility |",
    "| --- | ---: | --- |",
  );

  for (const [area, responsibility] of Object.entries(ARCHITECTURE_AREAS)) {
    const count = model.files.filter((file) => file.area === area).length;
    if (count > 0) output.push(`| ${area} | ${count} | ${responsibility} |`);
  }

  output.push(
    "",
    "## Largest modules",
    "",
    "| Module | Lines | Size | Area | Phase | Top-level | Exports |",
    "| --- | ---: | ---: | --- | --- | ---: | ---: |",
  );
  for (const file of [...model.files]
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file, "en"))
    .slice(0, 20)) {
    output.push(
      `| \`${file.file}\` | ${file.lines} | ${formatBytes(file.bytes)} | ${file.area} | ${file.phaseTags.join(", ")} | ${file.declarations.length} | ${file.declarations.filter((item) => item.exported).length} |`,
    );
  }

  output.push(
    "",
    "## Module index",
    "",
    "| Module | Area | Phase | Runtime dependencies | Type-only dependencies |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const file of model.files) {
    const runtime = groupedInternalImports(file, false);
    const types = groupedInternalImports(file, true);
    output.push(
      `| \`${file.file}\` | ${file.area} | ${file.phaseTags.join(", ")} | ${runtime.length > 0 ? runtime.map((item) => `\`${item}\``).join("<br>") : "—"} | ${types.length > 0 ? types.map((item) => `\`${item}\``).join("<br>") : "—"} |`,
    );
  }

  const largestDeclarations = model.files
    .flatMap((file) =>
      file.declarations.map((declaration) => ({ ...declaration, file: file.file })),
    )
    .sort((left, right) =>
      right.lines - left.lines ||
      left.file.localeCompare(right.file, "en") ||
      left.start - right.start,
    )
    .slice(0, 40);
  output.push(
    "",
    "## Largest top-level declarations",
    "",
    "| Symbol | Kind | Module | Lines | Span | Exported |",
    "| --- | --- | --- | ---: | ---: | --- |",
  );
  for (const declaration of largestDeclarations) {
    output.push(
      `| \`${escapeTable(declaration.name)}\` | ${declaration.kind} | \`${declaration.file}\` | ${declaration.lines} | ${declaration.start}–${declaration.end} | ${declaration.exported ? "yes" : "no"} |`,
    );
  }

  output.push(
    "",
    "## Detailed symbol lookup",
    "",
    "All top-level declarations and exact line spans are generated separately:",
    "",
    "```bash",
    "rg -n \"<symbol-or-file>\" docs/generated/SYMBOLS.md",
    "```",
  );

  return `${output.join("\n").trimEnd()}\n`;
}

export function renderSymbolIndex(repoRoot = process.cwd()) {
  const model = buildRepositoryModel(repoRoot);
  const output = [
    "# Generated Symbol Index",
    "",
    "> Generated by `npm run context:map`. Do not edit or read end to end.",
    "> Query narrowly: `rg -n \"<symbol-or-file>\" docs/generated/SYMBOLS.md`.",
    "",
  ];

  for (const file of model.files) {
    if (file.declarations.length === 0) continue;
    output.push(
      `### \`${file.file}\``,
      "",
      "| Symbol | Kind | Lines | Exported |",
      "| --- | --- | ---: | --- |",
    );
    for (const declaration of file.declarations) {
      output.push(
        `| \`${escapeTable(declaration.name)}\` | ${declaration.kind} | ${declaration.start}–${declaration.end} | ${declaration.exported ? "yes" : "no"} |`,
      );
    }
    output.push("");
  }

  return `${output.join("\n").trimEnd()}\n`;
}

function nodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function findTopLevelFunction(ts, sourceFile, name) {
  return sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

function findTopLevelInterface(ts, sourceFile, name) {
  return sourceFile.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
}

function findTopLevelVariable(ts, sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration;
    }
  }
  return null;
}

function collectTypeReferenceNames(ts, node) {
  const names = new Set();
  function visit(current) {
    if (ts.isTypeReferenceNode(current)) names.add(current.typeName.getText());
    ts.forEachChild(current, visit);
  }
  visit(node);
  return names;
}

function propertyNameText(ts, member, sourceFile) {
  if (!member.name) return "";
  if (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)) {
    return member.name.text;
  }
  return member.name.getText(sourceFile);
}

function collectCalledNames(ts, node) {
  const names = [];
  function visit(current) {
    if (ts.isCallExpression(current)) names.push(current.expression.getText());
    ts.forEachChild(current, visit);
  }
  visit(node);
  return names;
}

function collectThisProperties(ts, node) {
  const properties = [];
  function visit(current) {
    if (
      ts.isPropertyAccessExpression(current) &&
      current.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      properties.push(current.name.text);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return properties;
}

function runtimeCycles(model) {
  const graph = new Map(
    model.files.map((file) => [
      file.file,
      [...new Set(
        file.imports
          .filter((entry) => entry.target && !entry.typeOnly)
          .map((entry) => entry.target),
      )],
    ]),
  );
  const indexByNode = new Map();
  const lowLink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let index = 0;

  function visit(node) {
    indexByNode.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!graph.has(target)) continue;
      if (!indexByNode.has(target)) {
        visit(target);
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(target)));
      } else if (onStack.has(target)) {
        lowLink.set(node, Math.min(lowLink.get(node), indexByNode.get(target)));
      }
    }

    if (lowLink.get(node) !== indexByNode.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (
      component.length > 1 ||
      (component.length === 1 && (graph.get(component[0]) ?? []).includes(component[0]))
    ) {
      components.push(component.sort((left, right) => left.localeCompare(right, "en")));
    }
  }

  for (const node of [...graph.keys()].sort((left, right) => left.localeCompare(right, "en"))) {
    if (!indexByNode.has(node)) visit(node);
  }
  return components;
}

export function analyzeArchitecture(repoRoot = process.cwd()) {
  const model = buildRepositoryModel(repoRoot);
  const { ts } = model;
  const violations = [];

  function report(code, file, line, message, remediation) {
    violations.push({ code, file, line, message, remediation });
  }

  for (const file of model.files) {
    for (const diagnostic of file.parseDiagnostics) {
      const position = diagnostic.start ?? 0;
      const line = file.sourceFile.getLineAndCharacterOfPosition(position).line + 1;
      report(
        "SOURCE_PARSE_ERROR",
        file.file,
        line,
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        "fix the syntax error before trusting the generated dependency and symbol maps",
      );
    }
  }

  for (const file of model.files) {
    for (const dependency of file.imports.filter((entry) => entry.target && !entry.typeOnly)) {
      const target = dependency.target;
      if (
        !file.file.startsWith("tests/") &&
        target.startsWith("tests/")
      ) {
        report(
          "PRODUCTION_IMPORTS_TEST",
          file.file,
          dependency.line,
          `production module imports verification code: ${target}`,
          "move the shared contract into lib/ or keep the dependency test-only",
        );
      }
      if (
        file.file.startsWith("lib/") &&
        (target.startsWith("app/") || target.startsWith("components/"))
      ) {
        report(
          "LIB_IMPORTS_UI",
          file.file,
          dependency.line,
          `library module depends on the observation UI: ${target}`,
          "invert the dependency so UI reads a library-owned snapshot or contract",
        );
      }
      if (file.file === "lib/pnr-core.ts") {
        const allowed = new Set([
          "lib/pnr-core.ts",
          "lib/pnr-strategy.ts",
          "lib/pnr-formation-domain.ts",
        ]);
        const futureKernelModule = target.startsWith("lib/pnr-core/");
        if (!allowed.has(target) && !futureKernelModule) {
          report(
            "KERNEL_DEPENDENCY_OUTSIDE_ALLOWLIST",
            file.file,
            dependency.line,
            `simulation kernel imports ${target}`,
            "move runtime-neutral code under lib/pnr-core/, or update the reviewed kernel allowlist",
          );
        }
      }
    }

    for (const dependency of file.imports.filter((entry) => !entry.typeOnly && !entry.target)) {
      if (
        file.file.startsWith("lib/") &&
        /^(react|react-dom|next)(\/|$)/.test(dependency.specifier)
      ) {
        report(
          "LIB_IMPORTS_UI_RUNTIME",
          file.file,
          dependency.line,
          `library module imports UI runtime package ${dependency.specifier}`,
          "keep React/Next imports in app/ or components/ and pass plain snapshots across the boundary",
        );
      }
    }
  }

  for (const cycle of runtimeCycles(model)) {
    report(
      "RUNTIME_DEPENDENCY_CYCLE",
      cycle[0],
      1,
      `runtime dependency cycle: ${cycle.join(" -> ")} -> ${cycle[0]}`,
      "extract a lower-level contract or convert a type-only dependency to import type",
    );
  }

  const core = model.byPath.get("lib/pnr-core.ts");
  if (!core) {
    report(
      "KERNEL_MISSING",
      "lib/pnr-core.ts",
      1,
      "the canonical simulation kernel was not found",
      "update the architecture policy in the same change that relocates the kernel",
    );
  } else {
    const fixedDt = findTopLevelVariable(ts, core.sourceFile, "FIXED_DT");
    const validFixedDt =
      fixedDt?.initializer &&
      ts.isBinaryExpression(fixedDt.initializer) &&
      fixedDt.initializer.operatorToken.kind === ts.SyntaxKind.SlashToken &&
      fixedDt.initializer.left.getText(core.sourceFile) === "1" &&
      fixedDt.initializer.right.getText(core.sourceFile) === "60";
    if (!validFixedDt) {
      report(
        "FIXED_DT_CHANGED",
        core.file,
        fixedDt ? nodeLine(core.sourceFile, fixedDt) : 1,
        "FIXED_DT must remain exactly 1 / 60",
        "restore the fixed-step contract or approve and document an architecture change",
      );
    }

    const privateTypes = new Set([
      "AutonomousFormationSetup",
      "CandidateEvaluation",
      "PlanningRecord",
      "TeamPlan",
      "TeamPlanRoute",
      "TeamStrategyProfile",
      "TeamStrategyReference",
      "TeamStrategySelection",
    ]);
    for (const interfaceName of ["PublicObservation", "WorldState"]) {
      const declaration = findTopLevelInterface(ts, core.sourceFile, interfaceName);
      if (!declaration) {
        report(
          "PUBLIC_BOUNDARY_MISSING",
          core.file,
          1,
          `${interfaceName} is missing`,
          "update the checked boundary deliberately if the public world contract was renamed",
        );
        continue;
      }
      for (const typeName of collectTypeReferenceNames(ts, declaration)) {
        if (!privateTypes.has(typeName)) continue;
        report(
          "PRIVATE_TYPE_IN_PUBLIC_WORLD",
          core.file,
          nodeLine(core.sourceFile, declaration),
          `${interfaceName} references private planner type ${typeName}`,
          "publish a plain world fact instead of a plan, strategy, candidate, or private route",
        );
      }
    }

    const observation = findTopLevelInterface(ts, core.sourceFile, "PublicObservation");
    const forbiddenObservationFields = new Set([
      "autonomousSetup",
      "candidateEvaluations",
      "defensePlan",
      "defenseStrategy",
      "hiddenPlan",
      "offensePlan",
      "offenseStrategy",
      "opponentPlan",
      "opponentStrategy",
      "ownPlan",
      "planningLog",
      "route",
      "strategies",
      "strategy",
    ]);
    for (const member of observation?.members ?? []) {
      const name = propertyNameText(ts, member, core.sourceFile);
      if (!forbiddenObservationFields.has(name)) continue;
      report(
        "PRIVATE_FIELD_IN_PLANNER_OBSERVATION",
        core.file,
        nodeLine(core.sourceFile, member),
        `PublicObservation exposes private field ${name}`,
        "derive a public world fact and keep plans, routes, candidates, and strategies team-private",
      );
    }

    const config = findTopLevelInterface(ts, core.sourceFile, "SimulationConfig");
    const outcomeShortcut =
      /scenario.?id|case.?id|held.?out|expected.?outcome|outcome.?override|terminal.?override|result.?patch|preset.?result/i;
    for (const member of config?.members ?? []) {
      const name = propertyNameText(ts, member, core.sourceFile);
      if (!outcomeShortcut.test(name)) continue;
      report(
        "OUTCOME_SHORTCUT_IN_CONFIG",
        core.file,
        nodeLine(core.sourceFile, member),
        `SimulationConfig contains outcome-targeting field ${name}`,
        "express only public initial conditions, seed, strategy, and bounded runtime options",
      );
    }

    const observationFactory = findTopLevelFunction(
      ts,
      core.sourceFile,
      "createPlannerObservation",
    );
    if (!observationFactory) {
      report(
        "OBSERVATION_FACTORY_MISSING",
        core.file,
        1,
        "createPlannerObservation is missing",
        "retain one reviewed public-world projection point or update this policy with its replacement",
      );
    } else {
      const returnType = observationFactory.type?.getText(core.sourceFile);
      if (returnType !== "PublicObservation") {
        report(
          "OBSERVATION_FACTORY_RETURN_TYPE",
          core.file,
          nodeLine(core.sourceFile, observationFactory),
          `createPlannerObservation returns ${returnType ?? "an inferred type"}`,
          "return the explicit PublicObservation contract",
        );
      }
      for (const parameter of observationFactory.parameters) {
        for (const typeName of collectTypeReferenceNames(ts, parameter)) {
          if (!privateTypes.has(typeName)) continue;
          report(
            "PRIVATE_INPUT_TO_OBSERVATION_FACTORY",
            core.file,
            nodeLine(core.sourceFile, parameter),
            `createPlannerObservation accepts private planner type ${typeName}`,
            "build observations only from world state, team identity, and public trigger events",
          );
        }
      }
    }

    for (const functionName of ["evaluateOffenseCandidates", "evaluateDefenseCandidates"]) {
      const declaration = findTopLevelFunction(ts, core.sourceFile, functionName);
      if (!declaration) {
        report(
          "PLANNER_ENTRY_MISSING",
          core.file,
          1,
          `${functionName} is missing`,
          "update the architecture policy in the same change that replaces the planner entry",
        );
        continue;
      }
      const firstType = declaration.parameters[0]?.type?.getText(core.sourceFile);
      if (firstType !== "PublicObservation") {
        report(
          "PLANNER_BYPASSES_PUBLIC_OBSERVATION",
          core.file,
          nodeLine(core.sourceFile, declaration),
          `${functionName} receives ${firstType ?? "an inferred value"} instead of PublicObservation`,
          "score candidates from the reviewed public observation, not raw world or opponent plans",
        );
      }
    }

    const simulationClass = core.sourceFile.statements.find(
      (statement) => ts.isClassDeclaration(statement) && statement.name?.text === "PnrSimulation",
    );
    if (!simulationClass) {
      report(
        "SIMULATION_CLASS_MISSING",
        core.file,
        1,
        "PnrSimulation is missing",
        "update the checked orchestration boundary when replacing the simulation class",
      );
    } else {
      const methods = new Map(
        simulationClass.members
          .filter((member) => ts.isMethodDeclaration(member) && member.name)
          .map((member) => [member.name.getText(core.sourceFile), member]),
      );
      for (const [methodName, forbidden] of [
        ["replanOffense", ["defensePlan", "defenseStrategyProfile"]],
        ["replanDefense", ["offensePlan", "offenseStrategyProfile"]],
      ]) {
        const method = methods.get(methodName);
        if (!method) {
          report(
            "TEAM_REPLAN_BOUNDARY_MISSING",
            core.file,
            nodeLine(core.sourceFile, simulationClass),
            `${methodName} is missing`,
            "retain separately reviewable offense and defense replanning boundaries",
          );
          continue;
        }
        const properties = collectThisProperties(ts, method);
        for (const property of forbidden) {
          if (!properties.includes(property)) continue;
          report(
            "TEAM_READS_OPPONENT_PRIVATE_STATE",
            core.file,
            nodeLine(core.sourceFile, method),
            `${methodName} reads this.${property}`,
            "use public world facts; never pass the opponent plan or strategy into team planning",
          );
        }
      }

      const plannerCalls = new Set([
        "chooseCandidate",
        "evaluateDefenseCandidates",
        "evaluateOffenseCandidates",
        "makeDefensePlan",
        "makeOffensePlan",
        "scoreCandidateWithStrategy",
      ]);
      for (const [methodName, method] of methods) {
        if (!/^(integrate|resolve|maybeResolve)/.test(methodName)) continue;
        for (const call of collectCalledNames(ts, method)) {
          const simpleName = call.split(".").at(-1);
          if (!plannerCalls.has(simpleName)) continue;
          report(
            "NEUTRAL_RESOLVER_SELECTS_PLAN",
            core.file,
            nodeLine(core.sourceFile, method),
            `${methodName} calls planner/scoring function ${call}`,
            "move scoring and plan selection to the offense or defense replan boundary",
          );
        }
      }
    }

    function scanForNondeterminism(node) {
      if (ts.isCallExpression(node)) {
        const call = node.expression.getText(core.sourceFile);
        const forbiddenCalls = new Set([
          "Date.now",
          "Math.random",
          "crypto.randomUUID",
          "fetch",
          "performance.now",
          "requestAnimationFrame",
          "setInterval",
          "setTimeout",
        ]);
        if (forbiddenCalls.has(call)) {
          report(
            "NONDETERMINISTIC_KERNEL_API",
            core.file,
            nodeLine(core.sourceFile, node),
            `simulation kernel calls ${call}`,
            "derive behavior only from fixed-step state, explicit inputs, and the seeded deterministic path",
          );
        }
      } else if (
        ts.isNewExpression(node) &&
        node.expression.getText(core.sourceFile) === "Date"
      ) {
        report(
          "NONDETERMINISTIC_KERNEL_API",
          core.file,
          nodeLine(core.sourceFile, node),
          "simulation kernel constructs Date",
          "derive time from world.tick and FIXED_DT",
        );
      } else if (
        ts.isIdentifier(node) &&
        ["document", "localStorage", "window"].includes(node.text)
      ) {
        report(
          "BROWSER_API_IN_KERNEL",
          core.file,
          nodeLine(core.sourceFile, node),
          `simulation kernel references browser global ${node.text}`,
          "keep the kernel headless and move browser access into the observation UI",
        );
      }
      ts.forEachChild(node, scanForNondeterminism);
    }
    scanForNondeterminism(core.sourceFile);
  }

  violations.sort((left, right) =>
    left.file.localeCompare(right.file, "en") ||
    left.line - right.line ||
    left.code.localeCompare(right.code, "en"),
  );
  return { checks: ARCHITECTURE_CHECKS, model, violations };
}

export function formatArchitectureViolations(violations) {
  return violations
    .map(
      (violation) =>
        `${violation.file}:${violation.line} [${violation.code}] ${violation.message}\n` +
        `  Fix: ${violation.remediation}`,
    )
    .join("\n");
}
