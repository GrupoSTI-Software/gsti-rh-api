import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786595131487 — alcance explícito y avisos saneados en las cargas
 * masivas de turnos y vacaciones. Sin BD: se ejecuta la coerción del lookup
 * y se fija el contrato en el código fuente (mismo patrón que el import de
 * empleados y los IDOR de turnos).
 */

const EMPLOYEE_SERVICE = join(process.cwd(), 'app/services/employee_service.ts')
const VACATION_SERVICE = join(process.cwd(), 'app/services/employee_vacation_service.ts')
const EMPLOYEE_CONTROLLER = join(process.cwd(), 'app/controllers/employee_controller.ts')
const VACATION_CONTROLLER = join(process.cwd(), 'app/controllers/employee_vacation_controller.ts')
const EMPLOYEE_ROUTES = join(process.cwd(), 'start/routes/employee_routes.ts')
const VACATION_ROUTES = join(process.cwd(), 'start/routes/employee_vacation_routes.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf-8')
}

function sliceBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken)
  if (start < 0) {
    throw new Error(`No se encontró el ancla de inicio: ${startToken}`)
  }
  const end = source.indexOf(endToken, start + startToken.length)
  if (end < 0) {
    throw new Error(`No se encontró el ancla de fin: ${endToken}`)
  }
  return source.slice(start, end)
}

function sliceFrom(source: string, startToken: string): string {
  const start = source.indexOf(startToken)
  if (start < 0) {
    throw new Error(`No se encontró el ancla de inicio: ${startToken}`)
  }
  return source.slice(start)
}

/**
 * Réplica ejecutable de C-8: un id de Excel solo se consulta si es un
 * entero positivo. Cualquier otro valor (objeto de ExcelJS, texto, 0)
 * se trata como no encontrado — mismo camino que una referencia ajena.
 */
function coerceShiftImportEmployeeId(raw: unknown): number | null {
  const numericEmployeeId = Number(raw)
  return Number.isInteger(numericEmployeeId) && numericEmployeeId > 0
    ? numericEmployeeId
    : null
}

function shiftNotFoundMessage(rowNumber: number, employeeId: unknown): string {
  return `Fila ${rowNumber}: Empleado con ID ${employeeId} no encontrado`
}

function vacationNotFoundMessage(rowNumber: number, payrollId: string): string {
  return `Fila ${rowNumber}: No se encontró empleado con identificador de nómina "${payrollId}".`
}

test.group('USRH1786595131487 — coerción del lookup de turnos', () => {
  test('entero positivo (número o string) sí se consulta', ({ assert }) => {
    assert.equal(coerceShiftImportEmployeeId(42), 42)
    assert.equal(coerceShiftImportEmployeeId('42'), 42)
    assert.equal(coerceShiftImportEmployeeId(42.0), 42)
  })

  test('cero, negativo, decimal, NaN y objeto de ExcelJS no se consultan', ({ assert }) => {
    assert.isNull(coerceShiftImportEmployeeId(0))
    assert.isNull(coerceShiftImportEmployeeId(-3))
    assert.isNull(coerceShiftImportEmployeeId(1.5))
    assert.isNull(coerceShiftImportEmployeeId('abc'))
    assert.isNull(coerceShiftImportEmployeeId({ richText: [{ text: '99' }] }))
    assert.isNull(coerceShiftImportEmployeeId({ formula: 'A1', result: 99 }))
  })

  test('el service usa exactamente esa coerción y el whereIn explícito', ({ assert }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_SERVICE),
      'async importShiftAssignmentsFromExcel',
      'Genera un reporte de asistencia'
    )

    assert.include(body, 'const numericEmployeeId = Number(employeeId)')
    assert.include(body, 'Number.isInteger(numericEmployeeId) && numericEmployeeId > 0')
    assert.include(body, ".whereIn('businessUnitId', allowedBusinessUnitIds)")
    assert.include(body, ".where('employeeId', numericEmployeeId)")
    assert.notInclude(body, 'Employee.find(')
    assert.notInclude(body, 'allowedBusinessUnitIds.length')
  })
})

test.group('USRH1786595131487 — anti-enumeración', () => {
  test('referencia ajena e inexistente de turnos comparten plantilla y no mencionan alcance', ({
    assert,
  }) => {
    const foreignId = 88001
    const missingId = 999999999
    const foreign = shiftNotFoundMessage(4, foreignId)
    const missing = shiftNotFoundMessage(4, missingId)

    assert.equal(foreign, 'Fila 4: Empleado con ID 88001 no encontrado')
    assert.equal(missing.replace(String(missingId), String(foreignId)), foreign)
    assert.notInclude(foreign, 'alcance')
    assert.notInclude(missing, 'alcance')
  })

  test('el aviso de turnos interpola el id crudo del Excel, no el numérico', ({ assert }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_SERVICE),
      'async importShiftAssignmentsFromExcel',
      'Genera un reporte de asistencia'
    )

    assert.include(
      body,
      'Fila ${rowNumber}: Empleado con ID ${employeeId} no encontrado'
    )
    assert.notInclude(
      body,
      'Fila ${rowNumber}: Empleado con ID ${numericEmployeeId} no encontrado'
    )
  })

  test('referencia ajena e inexistente de vacaciones son indistinguibles', ({ assert }) => {
    const foreign = vacationNotFoundMessage(6, 'NOM-B-100')
    const missing = vacationNotFoundMessage(6, 'NO-EXISTE')

    assert.equal(
      foreign,
      'Fila 6: No se encontró empleado con identificador de nómina "NOM-B-100".'
    )
    assert.notInclude(foreign, 'alcance')
    assert.notInclude(missing, 'alcance')
    assert.equal(
      foreign.replace('NOM-B-100', 'NO-EXISTE'),
      missing
    )
  })

  test('el lookup de vacaciones pone el whereIn fuera del OR de nómina', ({ assert }) => {
    const body = sliceBetween(
      readSource(VACATION_SERVICE),
      'async importVacationFromExcel',
      'private async getVacationPeriodsOrdered'
    )

    const whereInIdx = body.indexOf(".whereIn('business_unit_id', allowedBusinessUnitIds)")
    const orGroupIdx = body.indexOf('.where((q) => {')
    const payrollOrIdx = body.indexOf(".orWhere('employee_payroll_code', payrollId)")

    assert.isTrue(whereInIdx > 0, 'falta el whereIn explícito de empresa')
    assert.isTrue(orGroupIdx > whereInIdx, 'el whereIn debe ir ANTES del callback OR')
    assert.isTrue(payrollOrIdx > orGroupIdx, 'el orWhere de nómina vive dentro del grupo')
    assert.notInclude(body, 'allowedBusinessUnitIds.length')
    assert.include(
      body,
      'Fila ${rowNumber}: No se encontró empleado con identificador de nómina "${payrollId}".'
    )
  })

  test('los tres avisos por fila de turnos son fijos y no interpolan error.message', ({
    assert,
  }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_SERVICE),
      'async importShiftAssignmentsFromExcel',
      'Genera un reporte de asistencia'
    )

    const exceptionPushes = body.match(/: Error al crear excepción`/g) ?? []
    const assignPushes = body.match(/: Error al asignar turno`/g) ?? []
    assert.equal(exceptionPushes.length, 2)
    assert.equal(assignPushes.length, 1)

    assert.notInclude(body, 'Error al crear excepción - ${error.message}')
    assert.notInclude(body, 'Error al asignar turno - ${error.message}')
    assert.notInclude(body, 'no está en tu alcance')
    assert.notInclude(body, 'error: error.message')
  })
})

test.group('USRH1786595131487 — fugas de detalle interno cerradas', () => {
  test('T1: el 500 del service de turnos usa el resolver y no publica error.message', ({
    assert,
  }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_SERVICE),
      'async importShiftAssignmentsFromExcel',
      'Genera un reporte de asistencia'
    )

    assert.include(body, 'title: \'Error al importar\'')
    assert.include(body, 'message: \'Ocurrió un error al procesar el archivo Excel\'')
    assert.include(body, 'EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS')
    assert.include(body, "key: 'error-importacion-turnos'")
    assert.include(body, 'code: resolved.errorCode')
    assert.include(body, 'detail: resolved.detail')
    assert.include(body, 'logger.error')
    assert.notInclude(body, 'error: error.message')
  })

  test('T2 y A1: catches del controller de turnos conservan literales y quitan error', ({
    assert,
  }) => {
    const importBody = sliceBetween(
      readSource(EMPLOYEE_CONTROLLER),
      'async importShiftAssignments({',
      'async applyVacationDeduction'
    )
    const templateBody = sliceBetween(
      readSource(EMPLOYEE_CONTROLLER),
      'async getShiftAssignmentTemplate({',
      'async getAttendanceReport'
    )

    for (const [label, body] of [
      ['importShiftAssignments', importBody],
      ['getShiftAssignmentTemplate', templateBody],
    ] as const) {
      assert.include(body, 'EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS', label)
      assert.include(body, 'code: resolved.errorCode', label)
      assert.include(body, 'detail: resolved.detail', label)
      assert.notInclude(body, 'error: error.message', label)
      assert.include(body, 'catch (error: any)', label)
    }

    assert.include(importBody, 'message: \'Ocurrió un error inesperado al importar las asignaciones\'')
    assert.include(templateBody, 'message: \'Ocurrió un error inesperado al generar la plantilla\'')
  })

  test('T3: el 400 de ExcelJS no interpola excelError.message', ({ assert }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_CONTROLLER),
      'async importShiftAssignments({',
      'async applyVacationDeduction'
    )

    assert.include(body, 'message: \'El archivo debe ser un Excel válido (.xlsx o .xls).\'')
    assert.notInclude(body, 'excelError.message')
    assert.include(body, 'logger.warn')
    assert.include(body, 'catch (excelError: any)')
  })

  test('V1/V2: catches de vacaciones conservan catch (error) sin any y literales del BO', ({
    assert,
  }) => {
    const importBody = sliceFrom(
      readSource(VACATION_CONTROLLER),
      'async importVacationExcel({'
    )
    const templateBody = sliceBetween(
      readSource(VACATION_CONTROLLER),
      'async getVacationImportTemplate({',
      'async importVacationExcel({'
    )

    for (const [label, body] of [
      ['importVacationExcel', importBody],
      ['getVacationImportTemplate', templateBody],
    ] as const) {
      assert.include(body, "title: 'Server Error'", label)
      assert.include(
        body,
        "message: 'An unexpected error has occurred on the server'",
        label
      )
      assert.include(body, 'EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS', label)
      assert.notInclude(body, 'error: error.message', label)
      assert.include(body, 'catch (error)', label)
      assert.notInclude(body, 'catch (error: any)', label)
    }
  })

  test('V3: la plantilla de vacaciones ya no reenvía result.error', ({ assert }) => {
    const controllerBody = sliceBetween(
      readSource(VACATION_CONTROLLER),
      'async getVacationImportTemplate({',
      'async importVacationExcel({'
    )
    const serviceBody = sliceBetween(
      readSource(VACATION_SERVICE),
      'async generateVacationImportTemplate',
      'private colIndexToLetter'
    )

    assert.notInclude(controllerBody, 'error: result.error')
    assert.include(controllerBody, 'detail: result.detail')
    assert.include(controllerBody, 'key: result.key')
    assert.include(controllerBody, 'code: result.code')
    assert.include(serviceBody, 'EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS')
    assert.include(serviceBody, "title: 'Error al generar template'")
    assert.notInclude(serviceBody, 'error: error.message')
  })
})

test.group('USRH1786595131487 — scope pasado y rutas intocadas', () => {
  test('los controllers destructuran businessUnitScope y lo pasan al service', ({ assert }) => {
    const shiftImport = sliceBetween(
      readSource(EMPLOYEE_CONTROLLER),
      'async importShiftAssignments({',
      'async applyVacationDeduction'
    )
    const vacationImport = sliceFrom(
      readSource(VACATION_CONTROLLER),
      'async importVacationExcel({'
    )

    assert.include(shiftImport, 'businessUnitScope }: HttpContext')
    assert.include(shiftImport, 'businessUnitScope')
    assert.include(shiftImport, 'importShiftAssignmentsFromExcel')
    assert.include(vacationImport, 'businessUnitScope }: HttpContext')
    assert.include(vacationImport, 'importVacationFromExcel(file, businessUnitScope)')
  })

  test('las firmas de service reciben allowedBusinessUnitIds con default []', ({ assert }) => {
    const shiftSig = sliceBetween(
      readSource(EMPLOYEE_SERVICE),
      'async importShiftAssignmentsFromExcel',
      'const workbook'
    )
    const vacationSig = sliceBetween(
      readSource(VACATION_SERVICE),
      'async importVacationFromExcel',
      'const workbook'
    )

    assert.include(shiftSig, 'allowedBusinessUnitIds: number[] = []')
    assert.include(vacationSig, 'allowedBusinessUnitIds: number[] = []')
    assert.notInclude(vacationSig, 'error?: string')
  })

  test('las rutas de empleados y vacaciones siguen con auth + businessScope y no se editan aquí', ({
    assert,
  }) => {
    const employeeRoutes = readSource(EMPLOYEE_ROUTES)
    const vacationRoutes = readSource(VACATION_ROUTES)

    assert.include(employeeRoutes, 'middleware.auth()')
    assert.include(employeeRoutes, 'middleware.businessScope()')
    assert.include(vacationRoutes, 'middleware.auth()')
    assert.include(vacationRoutes, 'middleware.businessScope()')
  })

  test('el import de empleados no toma los códigos nuevos (R-5)', ({ assert }) => {
    const body = sliceBetween(
      readSource(EMPLOYEE_CONTROLLER),
      'async importFromExcel',
      'async inverseSync'
    )

    assert.include(body, 'resolveEmployeeImportApiError(error, 500, i18n)')
    assert.notInclude(body, 'SERVER_SHIFTS')
    assert.notInclude(body, 'SERVER_VACATIONS')
    assert.notInclude(body, 'error-importacion-turnos')
  })
})
