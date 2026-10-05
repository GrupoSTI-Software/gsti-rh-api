import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export interface ContractFinding {
  location: string
  rule: 'literal-reason' | 'missing-reason' | 'reason-constant-not-from-catalog'
  text: string
}

const FORBIDDEN_ARG_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.BinaryExpression,
])

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}

interface ParsedFile {
  name: string
  sf: ts.SourceFile
}

function isRunUnscopedCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'runUnscoped'
  )
}

/** Nombre base del argumento: `X` en `X` o en `X[clave]`. */
function reasonBaseName(arg: ts.Expression): string | null {
  if (ts.isIdentifier(arg)) return arg.text
  if (ts.isElementAccessExpression(arg) && ts.isIdentifier(arg.expression)) return arg.expression.text
  return null
}

export function inspectFiles(files: ParsedFile[]): ContractFinding[] {
  const findings: ContractFinding[] = []
  const reasonNames = new Set<string>()
  const at = (file: ParsedFile, node: ts.Node) =>
    `${file.name}:${file.sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`

  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (isRunUnscopedCall(node)) {
        const reason = node.arguments[1]
        if (!reason) {
          findings.push({ location: at(file, node), rule: 'missing-reason', text: '' })
        } else if (FORBIDDEN_ARG_KINDS.has(reason.kind)) {
          findings.push({ location: at(file, node), rule: 'literal-reason', text: reason.getText() })
        } else {
          const base = reasonBaseName(reason)
          if (base !== null) reasonNames.add(base)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file.sf)
  }

  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        reasonNames.has(node.name.text) &&
        node.initializer !== undefined &&
        !node.initializer.getText().includes('TENANT_UNSCOPED_REASON.')
      ) {
        findings.push({
          location: at(file, node),
          rule: 'reason-constant-not-from-catalog',
          text: node.name.text,
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(file.sf)
  }

  return findings
}

export function parseSource(name: string, source: string): ParsedFile {
  return { name, sf: ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true) }
}

export function inspectTree(root: string): ContractFinding[] {
  const paths = [...walk(join(root, 'app'), []), ...walk(join(root, 'commands'), [])].filter(
    (file) => !file.endsWith('app/constants/tenant_unscoped_reason.ts')
  )
  return inspectFiles(
    paths.map((file) => parseSource(file.replace(`${root}/`, ''), readFileSync(file, 'utf8')))
  )
}
