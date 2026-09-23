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

    assert.include(content, 'if (isOwnMessage) return importRowErrorMessage(error)')
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
  test('la pasada 1 compara ambas celdas tecleadas contra la activa y limita el detalle del rechazo', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'this.resolveImportScopeBusinessUnitId(allowedBusinessUnitIds)')
    assert.include(content, 'declaredCells')
    assert.include(content, "column === 'businessUnit'")
    assert.include(content, 'hasImportCellValue(value)')
    // El veredicto es igualdad de texto contra la activa: `mapBusinessUnit`
    // absorbería por similitud un nombre parecido al de la activa y lo cargaría.
    assert.include(content, 'this.normalizeBusinessUnitCell(typed) !== activeBusinessUnitName')
    assert.notInclude(content, 'mapBusinessUnit(typed, businessUnits)')
    // La asignación del id sí sigue usando el mapeo de siempre.
    assert.include(content, 'this.mapBusinessUnit(employeeData.businessUnit, businessUnits)')
    assert.include(content, 'this.mapBusinessUnit(employeeData.payrollBusinessUnit, businessUnits)')
    assert.include(content, 'activeBusinessUnit !== null')
    assert.include(content, 'logger.warn')
    assert.include(content, 'MAX_OFFENDING_ROWS_SHOWN = 20')
    assert.include(content, 'MAX_OFFENDING_CELL_ECHO_LENGTH = 80')
    assert.include(content, 'filas más.')
    assert.notInclude(content, 'allBusinessUnitsForResolution')
    assert.notInclude(content, 'resolveBusinessUnitByName')
    assert.notInclude(content, 'companyMismatchRows')
    assert.notMatch(content, /rowErrors\.push\(\{ row: rowNumber, message: error\.message/)
    assert.include(content, 'isCompanyMismatchError')
    assert.include(content, 'if (error.isCompanyMismatchError) {')
  })

  test('el texto del rechazo agrupa por fila aunque la ofensa se recolecte por celda', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    // Una cita por fila con su(s) valor(es) tecleado(s); el tope y el cierre
    // cuentan filas distintas, no celdas.
    assert.include(content, 'typedValuesByRow')
    assert.include(content, 'const offendingRowNumbers = [...typedValuesByRow.keys()]')
    assert.include(content, 'offendingRowNumbers.slice(0, MAX_OFFENDING_ROWS_SHOWN)')
    assert.include(content, '${offendingRowNumbers.length - shown.length} filas más.')
    // El warn también cuenta filas distintas.
    assert.include(content, 'rowCount: offendingRowNumbers.length')
    // El reporte de la respuesta sigue siendo por celda.
    assert.include(content, 'offendingRows,')
  })

  test('CA-10: el aviso al log del rechazo lleva ids y conteos, nunca nombres ni el texto del error', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    const warnStart = content.indexOf(
      'logger.warn(',
      content.indexOf('const offendingRowNumbers = [...new Set(')
    )
    const warnEnd = content.indexOf('throw this.createCompanyMismatchValidationError(', warnStart)
    assert.isAbove(warnStart, 0)
    assert.isAbove(warnEnd, warnStart)
    const warnCall = content.slice(warnStart, warnEnd)

    assert.include(warnCall, 'businessUnitId: activeBusinessUnitId')
    assert.include(warnCall, 'rows: offendingRowNumbers')
    assert.include(warnCall, 'rowCount: offendingRowNumbers.length')
    assert.include(warnCall, 'totalRows,')
    assert.notInclude(warnCall, 'businessUnitName')
    assert.notMatch(warnCall, /err:|error|message|\bbusinessUnit\b/)
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

  test('CA-11: las dos pasadas redactan la fila fallida con la misma política', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    const pass1Start = content.indexOf('for (const { row, rowNumber } of rows) {')
    const pass2Start = content.indexOf(
      'for (const { rowNumber, employeeData, businessUnitId, payrollBusinessUnitId, isUpdate } of validRows)'
    )
    const pass2End = content.indexOf('await this.syncCreatedEmployeesToZkDevices(createdEmployees)')
    assert.isAbove(pass1Start, 0)
    assert.isBelow(pass1Start, pass2Start)
    assert.isBelow(pass2Start, pass2End)

    for (const pass of [
      content.slice(pass1Start, pass2Start),
      content.slice(pass2Start, pass2End),
    ]) {
      assert.include(pass, 'message: this.resolveImportRowErrorMessage(error, rowNumber,')
      assert.notInclude(pass, 'importRowErrorMessage(error) })')
      assert.notMatch(pass, /message: error\.message/)
    }

    // Procedencia por bandera y por la familia de identidad duplicada; lo
    // demás sale genérico con su traza al log del servidor.
    assert.include(content, '(error as any).isImportRowMessageError === true')
    assert.include(content, 'personIdentityDuplicatedIndexFromError(error) !== null')
    assert.include(
      content,
      "logger.error({ err: error, row: rowNumber, businessUnitId }, 'Fila de carga masiva no procesada')"
    )
    assert.include(content, "return 'No fue posible procesar esta fila'")
  })

  test('CA-11: el mensaje propio del importador se reconoce por bandera, nunca por su texto', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(
      content,
      "throw this.createImportRowMessageError('No se pudo generar un código de empleado único')"
    )
    assert.include(content, '; (error as any).isImportRowMessageError = true')
    assert.notInclude(content, "new Error('No se pudo generar un código de empleado único')")
  })

  test('regla 4 intacta: el duplicado de CURP sigue siendo salto de fila con el resto cargando', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, "rowErrors.push({ row: rowNumber, message: 'CURP duplicado' })")
  })
})
