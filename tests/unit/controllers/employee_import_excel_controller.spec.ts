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

  test('409 por cupo vía EmployeeQuotaError; sin rama limitReached en 200', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    const methodStart = content.indexOf('async importFromExcel')
    const methodBody = content.slice(methodStart, methodStart + 6000)

    assert.include(methodBody, 'resolveEmployeeQuotaApiError')
    assert.include(methodBody, 'error instanceof EmployeeQuotaError')
    assert.notInclude(methodBody, 'summary.limitReached')
    assert.notInclude(methodBody, 'Límite de empleados alcanzado')
  })

  test('OpenAPI documenta 409 por cupo en import-excel', ({ assert }) => {
    const openapiFile = join(process.cwd(), 'docs/openapi.yaml')
    const content = readFileSync(openapiFile, 'utf-8')
    const sectionStart = content.indexOf('/api/employees/import-excel:')
    const sectionEnd = content.indexOf('/api/employees/{employeeId}/temporary-assignments:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, "'409':")
    assert.include(section, 'EMP.IMPORT.QUOTA_EXCEEDED')
    assert.include(section, 'EMP.IMPORT.NO_PLAN')
    assert.include(section, 'EmployeeImportQuotaApiError')
    assert.include(section, 'deprecated: true')
  })
})

test.group('employee_controller importFromExcel — USRH1789747321650', () => {
  test('409 por empresa distinta antes de la rama 400; responde key, code y data', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    const methodStart = content.indexOf('async importFromExcel')
    const methodBody = content.slice(methodStart, methodStart + 9000)

    assert.include(methodBody, 'isCompanyMismatchError')
    assert.include(methodBody, 'resolveEmployeeImportApiError(error, 409')
    assert.include(methodBody, 'code: resolved.errorCode')
    assert.include(methodBody, 'data: resolved.data')

    const mismatchIdx = methodBody.indexOf('isCompanyMismatchError')
    const headersIdx = methodBody.indexOf('isHeaderValidationError')
    assert.isBelow(mismatchIdx, headersIdx)
  })

  test('OpenAPI documenta el 409 de empresa distinta en import-excel', ({ assert }) => {
    const openapiFile = join(process.cwd(), 'docs/openapi.yaml')
    const content = readFileSync(openapiFile, 'utf-8')
    const sectionStart = content.indexOf('/api/employees/import-excel:')
    const sectionEnd = content.indexOf('/api/employees/{employeeId}/temporary-assignments:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, "'409':")
    assert.include(section, 'archivo-de-otra-empresa')
    assert.include(section, 'EMP.IMPORT.VAL_BUSINESS_UNIT')
    assert.include(section, 'offendingRows')
    assert.notInclude(section, 'empresa-distinta-en-archivo')
    assert.notInclude(section, 'EMP.IMPORT.VAL_COMPANY')
  })
})
