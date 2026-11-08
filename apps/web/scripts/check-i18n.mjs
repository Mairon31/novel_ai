import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const strict = process.argv.includes('--strict');

// Brand names, protocol identifiers and intentional technical examples are not UI copy.
const technical = new Set([
  'Noble AI', 'NOBLE CREATOR STUDIO', 'OpenRouter', 'Ollama',
  'Hugging Face', 'ComfyUI', 'Piper', 'KoboldCpp',
  'GPU', 'CPU', 'GGUF', 'VRAM', 'VN', 'LLM · HTTPS',
  'DPM++ 2M', 'DPM++ SDE', 'DPM++ 2M SDE', 'UniPC',
  'Euler ancestral', 'SGM Uniform', 'RMBG 2.0',
  'door_open', 'author/model', 'character.safetensors',
  'API Noble', 'GB VRAM', 'GiB', 'MiB', 'tokens', '· IPAdapter',
]);
const userFacingAttributes = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const feedbackSetters = /^(?:set(?:Notice|Message|Feedback|Saved|GenerationMessage|DraftProgress|IllustrationNotice|ReaderError)|window\.(?:confirm|alert)|confirm|alert)$/;
const issues = [];

function normalized(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isInterfaceCopy(value) {
  const text = normalized(value);
  if (!text || !/[A-Za-zÀ-ÿ]{3}/.test(text)) return false;
  if (technical.has(text)) return false;
  if (/^(https?:\/\/|[A-Za-z]:\\|\.{0,2}\/)/.test(text)) return false;
  if (/^\d+[KM]\s+tokens$/i.test(text)) return false;
  if (/^\{\{[A-Za-z0-9_]+\}\}$/.test(text)) return false;
  if (/^--[a-z0-9-]+/.test(text)) return false;
  if (/^[A-Z]{2,}(?:\s*[/+·]\s*[A-Z]{2,})*$/.test(text)) return false;
  if (/^[a-z_]+\.[a-zA-Z0-9_.-]+$/.test(text)) return false;
  if (/^[\d.,%+\-/: ]+$/.test(text)) return false;
  return true;
}

// API-client and routing errors are displayed in the UI too, even though they
// live in plain TypeScript rather than React components.
const uiSources = readdirSync(src).filter(name =>
  name.endsWith('.tsx') || name === 'api.ts' || name === 'workspaceRoute.ts');
for (const filename of uiSources.sort()) {
  const content = readFileSync(path.join(src, filename), 'utf8');
  const kind = filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, kind);

  function report(node, kind, value) {
    const clean = normalized(value);
    if (!isInterfaceCopy(clean)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    issues.push(filename + ':' + line + ' ' + kind + ': ' + JSON.stringify(clean.slice(0, 110)));
  }

  // Inspect only display branches of expressions, not protocol comparisons or data identifiers.
  function checkDisplayExpression(node, kind) {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, kind, node.text);
    } else if (ts.isTemplateExpression(node)) {
      report(node, kind, node.head.text);
      for (const span of node.templateSpans) report(span.literal, kind, span.literal.text);
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
               ts.isNonNullExpression(node)) {
      checkDisplayExpression(node.expression, kind);
    } else if (ts.isConditionalExpression(node)) {
      checkDisplayExpression(node.whenTrue, kind);
      checkDisplayExpression(node.whenFalse, kind);
    } else if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        checkDisplayExpression(node.left, kind);
        checkDisplayExpression(node.right, kind);
      } else if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                 node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                 node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        checkDisplayExpression(node.right, kind);
      }
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) report(node, 'JSX text', node.getText(sf));
    if (ts.isJsxAttribute(node) && userFacingAttributes.has(node.name.getText(sf)) &&
        node.initializer && ts.isStringLiteral(node.initializer)) {
      report(node, node.name.getText(sf), node.initializer.text);
    }
    if (ts.isJsxExpression(node)) {
      const parent = node.parent;
      if (ts.isJsxElement(parent) || ts.isJsxFragment(parent) ||
          (ts.isJsxAttribute(parent) && userFacingAttributes.has(parent.name.getText(sf)))) {
        checkDisplayExpression(node.expression, 'display expression');
      }
    }
    if (ts.isCallExpression(node) && feedbackSetters.test(node.expression.getText(sf)) &&
        node.arguments.length) {
      checkDisplayExpression(node.arguments[0], 'feedback message');
    }
    if (ts.isNewExpression(node) && node.expression.getText(sf) === 'Error' && node.arguments?.length) {
      checkDisplayExpression(node.arguments[0], 'frontend error');
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

if (issues.length) {
  process.stderr.write('i18n audit: ' + issues.length + ' untranslated UI literals\n');
  for (const issue of issues) process.stderr.write('  ' + issue + '\n');
  if (strict) process.exitCode = 1;
} else {
  process.stdout.write('i18n audit: no hardcoded JSX text, labels or UI feedback detected.\n');
}
