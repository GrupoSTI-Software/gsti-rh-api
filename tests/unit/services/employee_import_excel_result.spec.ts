import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const SERVICE_FILE = join(process.cwd(), 'app/services/employee_service.ts')

test.group('employee_service importFromExcel — USRH1785169801695', () => {
  test('no aborta el archivo completo por campos requeridos faltantes por fila', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.notInclude(
      content,
      'Todos los registros deben tener los campos requeridos completos.'
    )
    assert.include(content, 'collectMissingRequiredImportFields')
    assert.include(content, 'finalizeEmployeeImportResult')
  })

  test('expone rowErrors, warnings y alias errors en el resultado', ({ assert }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'rowErrors: EmployeeImportRowError[]')
    assert.include(content, 'buildEmployeeImportLegacyErrors')
    assert.include(content, 'message: \'CURP duplicado\'')
  })

  test('valida cupo todo-o-nada antes de la pasada 2 — sin camino limitReached degradado', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'assertImportWithinQuota')
    assert.include(content, 'resolveImportScopeBusinessUnitId')
    assert.notInclude(content, 'if (limitReached)')
    assert.include(content, 'limitReached: false')
  })
})
