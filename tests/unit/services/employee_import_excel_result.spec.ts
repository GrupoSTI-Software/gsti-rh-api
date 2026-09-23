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

  test('USRH1789698261610: la fila que choca con el UNIQUE no expone el texto crudo de MySQL', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'rowErrors.push({ row: rowNumber, message: importRowErrorMessage(error) })')
    assert.include(content, 'this.createPerson(employeeData, businessUnitId!)')
    assert.include(content, 'person.businessUnitId = businessUnitId')
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

test.group('employee_service importFromExcel — USRH1789747321650', () => {
  test('la pasada 1 compara ambas celdas crudas en scope y limita el detalle del rechazo', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'this.resolveImportScopeBusinessUnitId(allowedBusinessUnitIds)')
    assert.include(content, 'declaredCells')
    assert.include(content, "column === 'businessUnit'")
    assert.include(content, 'hasImportCellValue(value)')
    assert.include(content, 'mapBusinessUnit(typed, businessUnits)')
    assert.include(content, 'activeBusinessUnit !== null')
    assert.include(content, 'logger.warn')
    assert.include(content, 'slice(0, 20)')
    assert.include(content, 'filas más.')
    assert.notInclude(content, 'allBusinessUnitsForResolution')
    assert.notInclude(content, 'resolveBusinessUnitByName')
    assert.notInclude(content, 'companyMismatchRows')
    assert.notMatch(content, /rowErrors\.push\(\{ row: rowNumber, message: error\.message/)
    assert.include(content, 'isCompanyMismatchError')
    assert.include(content, 'if (error.isCompanyMismatchError) {')
  })

  test('el rechazo se lanza antes de evaluar el cupo (cero escrituras por construcción)', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')
    const rejectIdx = content.indexOf(
      'throw this.createCompanyMismatchValidationError(foreignRows, activeBusinessUnit?.businessUnitName ?? \'\')'
    )
    const quotaIdx = content.indexOf('await this.assertImportWithinQuota(allowedBusinessUnitIds, newEmployeesCount)')
    const loopIdx = content.indexOf('for (const { rowNumber, employeeData, businessUnitId, payrollBusinessUnitId, isUpdate } of validRows)')
    assert.isAbove(rejectIdx, 0)
    assert.isBelow(rejectIdx, quotaIdx)
    assert.isBelow(rejectIdx, loopIdx)
  })

  test('regla 5: el catch de la pasada 2 re-lanza el error sensible antes de registrar fila fallida', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'if (shouldAbortImportOnRowError(error)) throw error')
    // El catch externo ya re-lanzaba sensibles: no se duplica, se verifica.
    assert.include(content, 'if (isSensitiveDataWriteError(error)) {')
  })

  test('regla 4 intacta: el duplicado de CURP sigue siendo salto de fila con el resto cargando', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, "rowErrors.push({ row: rowNumber, message: 'CURP duplicado' })")
  })
})
