#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Lint de neutralidad terminológica.
 *
 * Recorre los archivos fuente del repositorio y reporta cualquier término
 * restringido encontrado. El proceso termina con código de salida 1 si
 * detecta al menos un hit, lo que permite usarlo como compuerta en CI.
 *
 * Uso:
 *   node scripts/lint-terminology.mjs              # Recorre el repo completo
 *   node scripts/lint-terminology.mjs path1 path2  # Limita a las rutas dadas
 *   node scripts/lint-terminology.mjs --list-only  # Lista archivos a inspeccionar
 *
 * Notas de diseño:
 * - Sin dependencias externas (sólo APIs nativas de Node).
 * - Las exclusiones contemplan migraciones históricas (originales y renames)
 *   donde el nombre antiguo es necesario para que la migración funcione.
 * - El reporte sólo expone path + línea + columna + término detectado y un
 *   recorte breve de la línea, evitando volcar contenido sensible al log.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const TERMS = [
  { name: 'psico*', pattern: /\bpsico[a-záéíóúñ]*/giu },
  { name: 'psychomet*', pattern: /\bpsychomet[a-z]*/giu },
  { name: 'DISC', pattern: /\bDISC\b/g },
  { name: 'Cleaver', pattern: /\bcleaver\b/giu },
  { name: 'Wonderlic', pattern: /\bwonderlic\b/giu },
  { name: '16PF', pattern: /\b16PF\b/g },
  { name: 'MMPI', pattern: /\bMMPI\b/g },
  { name: 'TERMAN', pattern: /\bterman\b/giu },
  { name: 'Raven', pattern: /\braven\b/giu },
  { name: 'Big Five', pattern: /\bbig[\s_-]+five\b/giu },
  { name: 'OCEAN', pattern: /\bOCEAN\b/g },
  { name: 'PAPI', pattern: /\bPAPI\b/g },
  { name: 'Kostick', pattern: /\bkostick\b/giu },
  { name: 'Beck', pattern: /\bbeck\b/giu },
  { name: 'IQ', pattern: /\bIQ\b/g },
  { name: 'coeficiente intelectual', pattern: /\bcoeficiente\s+intelectual\b/giu },
]

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.husky',
  'build',
  'dist',
  'tmp',
  'coverage',
  'docs',
  '.github',
  '.gsti-kg',
])

const EXCLUDED_FILES = new Set([
  'CHANGELOG',
  'CHANGELOG.md',
  'CHANGELOG.MD',
  'README.md',
  'README.MD',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'lint-terminology.mjs',
])

const EXCLUDED_RELATIVE_PATHS = new Set([
  // Migraciones originales (nombres históricos preservados deliberadamente).
  'database/migrations/1774641305000_create_psychometric_tests_table.ts',
  'database/migrations/1774641305001_create_psychometric_test_dimensions_table.ts',
  'database/migrations/1774641305002_create_position_psychometric_profiles_table.ts',
  'database/migrations/1774641305003_create_employee_psychometric_evaluations_table.ts',
  'database/migrations/1774641305004_create_employee_psychometric_evaluation_results_table.ts',
  // Migraciones de rename (necesitan referenciar el nombre antiguo).
  'database/migrations/1776400000000_rename_psychometric_tests_to_assessment_templates.ts',
  'database/migrations/1776400000001_rename_psychometric_test_dimensions_to_assessment_template_dimensions.ts',
  'database/migrations/1776400000002_rename_position_psychometric_profiles_to_position_assessment_profiles.ts',
  'database/migrations/1776400000003_rename_employee_psychometric_evaluations_to_employee_assessments.ts',
  'database/migrations/1776400000004_rename_employee_psychometric_evaluation_results_to_employee_assessment_results.ts',
  // TODO: Exclusiones temporales por residuos del refactor HU1-HU6.
  // Reabrir la HU correspondiente y, una vez limpiados los comentarios JSDoc
  // y el valor de búsqueda en el test, retirar estas entradas.
  'app/services/position_service.ts',
  'app/services/position_assessment_profile_service.ts',
  'tests/functional/assessment_template.spec.ts',
])

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.scss',
  '.sass',
  '.css',
  '.html',
  '.htm',
  '.sql',
  '.env.example',
])

const MAX_FILE_SIZE = 2 * 1024 * 1024

const args = process.argv.slice(2)
const listOnly = args.includes('--list-only')
const targetArgs = args.filter((a) => !a.startsWith('--'))

function toRelative(p) {
  return relative(ROOT, p).split(sep).join('/')
}

function isExcludedPath(absPath) {
  const rel = toRelative(absPath)
  if (EXCLUDED_RELATIVE_PATHS.has(rel)) return true
  const segments = rel.split('/')
  if (segments.some((seg) => EXCLUDED_DIRS.has(seg))) return true
  const base = segments[segments.length - 1]
  if (EXCLUDED_FILES.has(base)) return true
  return false
}

function isSourceFile(name) {
  if (SOURCE_EXTENSIONS.has(name)) return true
  const idx = name.lastIndexOf('.')
  if (idx === -1) return false
  return SOURCE_EXTENSIONS.has(name.slice(idx))
}

async function* walk(absPath) {
  const info = await stat(absPath)
  if (info.isDirectory()) {
    if (isExcludedPath(absPath)) return
    const entries = await readdir(absPath, { withFileTypes: true })
    for (const entry of entries) {
      const child = join(absPath, entry.name)
      if (isExcludedPath(child)) continue
      if (entry.isDirectory()) {
        yield* walk(child)
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        yield child
      }
    }
  } else if (info.isFile()) {
    if (isExcludedPath(absPath)) return
    if (!isSourceFile(absPath.split('/').pop() ?? '')) return
    yield absPath
  }
}

async function scanFile(absPath) {
  const info = await stat(absPath)
  if (info.size > MAX_FILE_SIZE) return []
  let content
  try {
    content = await readFile(absPath, 'utf8')
  } catch {
    return []
  }
  if (content.includes('\u0000')) return []

  const findings = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const term of TERMS) {
      term.pattern.lastIndex = 0
      let match
      while ((match = term.pattern.exec(line)) !== null) {
        findings.push({
          file: toRelative(absPath),
          line: i + 1,
          column: match.index + 1,
          term: term.name,
          match: match[0],
        })
        if (match.index === term.pattern.lastIndex) {
          term.pattern.lastIndex++
        }
      }
    }
  }
  return findings
}

function formatFinding(f) {
  return `  ${f.file}:${f.line}:${f.column}  [${f.term}] -> "${f.match}"`
}

async function main() {
  const targets = targetArgs.length > 0 ? targetArgs.map((p) => resolve(p)) : [ROOT]
  const allFiles = []
  for (const t of targets) {
    try {
      for await (const file of walk(t)) {
        allFiles.push(file)
      }
    } catch (err) {
      console.error(`No se pudo recorrer "${t}": ${err.message}`)
      process.exit(2)
    }
  }

  if (listOnly) {
    for (const f of allFiles) console.log(toRelative(f))
    process.exit(0)
  }

  const findings = []
  for (const file of allFiles) {
    const fileFindings = await scanFile(file)
    findings.push(...fileFindings)
  }

  if (findings.length === 0) {
    console.log(`✓ Lint de neutralidad terminológica: sin hallazgos en ${allFiles.length} archivo(s).`)
    process.exit(0)
  }

  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file).push(f)
  }

  console.error(`✗ Lint de neutralidad terminológica: ${findings.length} hallazgo(s) en ${byFile.size} archivo(s).`)
  console.error('')
  for (const [file, list] of byFile) {
    console.error(file)
    for (const f of list) console.error(formatFinding(f))
    console.error('')
  }
  console.error('Términos restringidos detectados. Ajusta el código o, si corresponde, agrega la ruta a las exclusiones del lint.')
  process.exit(1)
}

main().catch((err) => {
  console.error(`Error inesperado en el lint de terminología: ${err.stack || err.message}`)
  process.exit(2)
})
