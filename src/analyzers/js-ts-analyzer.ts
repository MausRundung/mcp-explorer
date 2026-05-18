import * as path from "path";
import ts from "typescript";
import { AnalyzerOutput } from "./analyzer-types.js";

function scriptKindFromExtension(ext: string): ts.ScriptKind {
  switch (ext) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    default:
      return ts.ScriptKind.JS;
  }
}

function isStringLiteralLike(node: ts.Node): node is ts.StringLiteralLike {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function stringifyNamedBindings(namedBindings: ts.NamedImportBindings | undefined): {
  namespaceImport?: string;
  namedImports?: Array<{ name: string; alias?: string }>;
} {
  if (!namedBindings) return {};
  if (ts.isNamespaceImport(namedBindings)) {
    return { namespaceImport: namedBindings.name.text };
  }
  const namedImports = namedBindings.elements.map(el => {
    const name = el.name.text;
    const propertyName = el.propertyName?.text;
    return propertyName && propertyName !== name ? { name: propertyName, alias: name } : { name };
  });
  return { namedImports };
}

function formatImportLine(entry: {
  kind: "import" | "import=" | "require" | "dynamic" | "side-effect";
  from: string;
  defaultImport?: string;
  namespaceImport?: string;
  namedImports?: Array<{ name: string; alias?: string }>;
  typeOnly?: boolean;
}): string {
  const parts: string[] = [];
  parts.push(`from "${entry.from}"`);
  parts.push(`kind=${entry.kind}`);
  if (entry.typeOnly) parts.push(`typeOnly=true`);
  if (entry.defaultImport) parts.push(`default=${entry.defaultImport}`);
  if (entry.namespaceImport) parts.push(`namespace=${entry.namespaceImport}`);
  if (entry.namedImports && entry.namedImports.length > 0) {
    const rendered = entry.namedImports
      .map(n => (n.alias ? `${n.name} as ${n.alias}` : n.name))
      .join(", ");
    parts.push(`named={${rendered}}`);
  }
  return parts.join(", ");
}

function formatExportLine(entry: {
  kind: "named" | "default" | "star" | "re-export" | "export=" | "cjs";
  names?: Array<{ name: string; alias?: string }>;
  from?: string;
  detail?: string;
}): string {
  const parts: string[] = [];
  parts.push(`kind=${entry.kind}`);
  if (entry.from) parts.push(`from="${entry.from}"`);
  if (entry.names && entry.names.length > 0) {
    const rendered = entry.names.map(n => (n.alias ? `${n.name} as ${n.alias}` : n.name)).join(", ");
    parts.push(`names={${rendered}}`);
  }
  if (entry.detail) parts.push(entry.detail);
  return parts.join(", ");
}

export function analyzeJsOrTs(filePath: string, content: string): AnalyzerOutput {
  const ext = path.extname(filePath).toLowerCase();
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKindFromExtension(ext));

  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];

  const addModule = (mod: string) => {
    if (!moduleSpecifiers.includes(mod)) moduleSpecifiers.push(mod);
  };

  const isNodeExported = (node: ts.Node): boolean => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  };

  const isNodeDefaultExported = (node: ts.Node): boolean => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (!modifiers) return false;
    const hasExport = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const hasDefault = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    return hasExport && hasDefault;
  };

  const addNamedExport = (name: string) => {
    exports.push(formatExportLine({ kind: "named", names: [{ name }] }));
  };

  const addFunction = (name: string, exported: boolean, isDefault?: boolean) => {
    const parts: string[] = [];
    parts.push(name);
    if (exported) parts.push("exported");
    if (isDefault) parts.push("default");
    functions.push(parts.join(", "));
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const from = isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      if (from) addModule(from);

      const importClause = node.importClause;
      if (!importClause) {
        imports.push(formatImportLine({ kind: "side-effect", from }));
        return;
      }

      const defaultImport = importClause.name?.text;
      const { namespaceImport, namedImports } = stringifyNamedBindings(importClause.namedBindings);
      imports.push(
        formatImportLine({
          kind: "import",
          from,
          defaultImport,
          namespaceImport,
          namedImports,
          typeOnly: importClause.isTypeOnly
        })
      );
      return;
    }

    if (ts.isImportEqualsDeclaration(node)) {
      const mr = node.moduleReference;
      if (ts.isExternalModuleReference(mr) && mr.expression && isStringLiteralLike(mr.expression)) {
        const from = mr.expression.text;
        addModule(from);
        imports.push(formatImportLine({ kind: "import=", from, defaultImport: node.name.text }));
      }
      return;
    }

    if (ts.isExportAssignment(node)) {
      exports.push(formatExportLine({ kind: node.isExportEquals ? "export=" : "default" }));
      return;
    }

    if (ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier && isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
      if (from) addModule(from);
      if (!node.exportClause) {
        exports.push(formatExportLine({ kind: "star", from }));
        return;
      }
      if (ts.isNamedExports(node.exportClause)) {
        const names = node.exportClause.elements.map(el => {
          const name = el.name.text;
          const propertyName = el.propertyName?.text;
          return propertyName && propertyName !== name ? { name: propertyName, alias: name } : { name };
        });
        exports.push(formatExportLine({ kind: from ? "re-export" : "named", from, names }));
      }
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const exported = isNodeExported(node);
      const isDefault = isNodeDefaultExported(node);
      addFunction(node.name.text, exported, isDefault);
      if (isDefault) {
        exports.push(formatExportLine({ kind: "default", detail: `name=${node.name.text}` }));
      } else if (exported) {
        addNamedExport(node.name.text);
      }
    }

    if (ts.isVariableStatement(node)) {
      const exported = isNodeExported(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          addFunction(name, exported);
        }
        if (exported) addNamedExport(name);
      }
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const exported = isNodeExported(node);
      const isDefault = isNodeDefaultExported(node);
      if (isDefault) {
        exports.push(formatExportLine({ kind: "default", detail: `name=${node.name.text}` }));
      } else if (exported) {
        addNamedExport(node.name.text);
      }
    }

    if (ts.isInterfaceDeclaration(node)) {
      if (isNodeExported(node)) addNamedExport(node.name.text);
    }

    if (ts.isTypeAliasDeclaration(node)) {
      if (isNodeExported(node)) addNamedExport(node.name.text);
    }

    if (ts.isEnumDeclaration(node)) {
      if (isNodeExported(node)) addNamedExport(node.name.text);
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      if (ts.isPropertyAccessExpression(left)) {
        const leftText = left.getText(sourceFile);
        if (leftText === "module.exports" || leftText.startsWith("module.exports.") || leftText.startsWith("exports.")) {
          exports.push(formatExportLine({ kind: "cjs", detail: `target=${leftText}` }));
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length >= 1) {
        const arg0 = node.arguments[0];
        if (isStringLiteralLike(arg0)) {
          const from = arg0.text;
          addModule(from);
          imports.push(formatImportLine({ kind: "require", from }));
        }
      }

      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length >= 1) {
        const arg0 = node.arguments[0];
        if (isStringLiteralLike(arg0)) {
          const from = arg0.text;
          addModule(from);
          imports.push(formatImportLine({ kind: "dynamic", from }));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const unique = <T>(arr: T[]) => Array.from(new Set(arr));
  return {
    imports: unique(imports),
    exports: unique(exports),
    functions: unique(functions),
    moduleSpecifiers
  };
}
