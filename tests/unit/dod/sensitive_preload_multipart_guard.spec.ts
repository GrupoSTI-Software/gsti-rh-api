import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from '@japa/runner'

const root = resolve(process.cwd())

const readIfExists = (relativePath: string): string => {
  const absolutePath = resolve(root, relativePath)
  if (!existsSync(absolutePath)) {
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

const collectMatches = (pattern: RegExp, sources: readonly string[]): string[] => {
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)
  const hits: string[] = []
  for (const relativePath of sources) {
    const source = readIfExists(relativePath)
    if (!source) {
      continue
    }
    for (const match of source.matchAll(globalPattern)) {
      hits.push(`${relativePath}: ${match[0]}`)
    }
  }
  return hits
}

const API_PRELOAD_CONTROLLER_PATHS = [
  'app/controllers/employee_spouse_controller.ts',
  'app/controllers/work_disability_note_controller.ts',
  'app/controllers/employee_lactation_periods_controller.ts',
  'app/controllers/employee_emergency_contact_controller.ts',
  'app/controllers/traumatic_event_report_controller.ts',
] as const

const API_PRELOAD_VALIDATOR_PATHS = [
  'app/validators/employee_spouse.ts',
  'app/validators/work_disability_note.ts',
  'app/validators/employee_lactation_period.ts',
  'app/validators/employee_emergency_contact.ts',
  'app/validators/traumatic_event_report.ts',
] as const

test.group('DoD R-2 — guardados P1-P6 sin multipart (USRH1789328027048)', () => {
  test('controladores del API no leen archivos en el guardado', ({ assert }) => {
    const hits = collectMatches(/request\.(file|files|allFiles)\(/, API_PRELOAD_CONTROLLER_PATHS)
    assert.deepEqual(hits, [])
  })

  test('validadores del API no declaran vine.file en P1-P6', ({ assert }) => {
    const hits = collectMatches(/vine\.file\(/, API_PRELOAD_VALIDATOR_PATHS)
    assert.deepEqual(hits, [])
  })
})
