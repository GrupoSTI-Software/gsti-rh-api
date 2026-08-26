import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786566437097 — entregable 12 / CA-18.
 * Escritura masiva acotada por empresa; `deleteAllAssists` eliminado.
 */

const APP_DIR = join(process.cwd(), 'app')
const ASSIST_SERVICE = join(process.cwd(), 'app/services/assist_service.ts')
const DEMO_WIPE = join(
  process.cwd(),
  'app/modules/onboarding/demo_seed/services/demo_wipe.service.ts'
)
const SIMULATE_ATTENDANCE = join(
  process.cwd(),
  'app/modules/onboarding/simulate_attendance/simulate_attendance.service.ts'
)

function collectTsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTsFiles(fullPath))
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

/** Sitios vivos con delete/update masivo vía Assist.query — deben acotar por tenant. */
const BULK_WRITE_ALLOWLIST = new Set([DEMO_WIPE, SIMULATE_ATTENDANCE])

function findUnscopedAssistBulkWrites(filePath: string, content: string): string[] {
  if (BULK_WRITE_ALLOWLIST.has(filePath)) {
    return []
  }

  const violations: string[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('Assist.query')) continue

    const window = lines.slice(i, i + 8).join('\n')
    const isBulkWrite = /\.(delete|update)\(/.test(window)
    if (!isBulkWrite) continue

    if (!window.includes('business_unit_id')) {
      violations.push(`${filePath}:${i + 1}`)
    }
  }

  return violations
}

test.group('Assists — escritura masiva acotada (USRH1786566437097)', () => {
  test('deleteAllAssists ya no existe en assist_service', ({ assert }) => {
    const content = readFileSync(ASSIST_SERVICE, 'utf-8')
    assert.notInclude(content, 'deleteAllAssists')
    assert.notMatch(content, /Assist\.query\(\)\s*\n\s*\.delete\(\)/)
  })

  test('demo_wipe acota delete por business_unit_id', ({ assert }) => {
    const content = readFileSync(DEMO_WIPE, 'utf-8')
    assert.include(content, ".where('business_unit_id', demoEmployee.businessUnitId)")
    assert.include(content, '.delete()')
  })

  test('simulate_attendance acota delete por business_unit_id', ({ assert }) => {
    const content = readFileSync(SIMULATE_ATTENDANCE, 'utf-8')
    assert.include(content, ".where('business_unit_id', businessUnitId)")
    assert.include(content, 'if (!businessUnitId)')
    assert.include(content, '.delete()')
  })

  test('app/ no tiene Assist.query().delete()/update() sin predicado de empresa', ({
    assert,
  }) => {
    const violations: string[] = []

    for (const filePath of collectTsFiles(APP_DIR)) {
      const content = readFileSync(filePath, 'utf-8')
      violations.push(...findUnscopedAssistBulkWrites(filePath, content))
    }

    assert.deepEqual(
      violations,
      [],
      `Escritura masiva sin business_unit_id: ${violations.join(', ')}`
    )
  })
})
