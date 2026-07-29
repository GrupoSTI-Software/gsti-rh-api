import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const CONTROLLER_FILE = join(process.cwd(), 'app/controllers/employee_controller.ts')

test.group('employee_controller importFromExcel — errores estándar', () => {
  test('500 no incluye campo error con message interno', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    const methodStart = content.indexOf('async importFromExcel')
    const methodBody = content.slice(methodStart, methodStart + 6000)

    assert.notInclude(methodBody, 'error: error.message')
    assert.include(methodBody, 'resolveEmployeeImportApiError')
    assert.include(methodBody, 'code: resolved.errorCode')
  })
})
