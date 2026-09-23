import { test } from '@japa/runner'
import {
  resolveEmployeeImportApiError,
  shouldAbortImportOnRowError,
} from '#helpers/employee_import_api_error'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '#constants/employee_import_error_codes'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import type { EmployeeImportCompanyMismatchRow } from '../../../app/interfaces/employee_import_result_interface.js'

/** USRH1789747321650 reglas 1, 2, 5 y 6 a nivel de contrato (puro, sin BD). */

/**
 * Factory mínima alineada con Task 8 Step 4 (el servicio la sustituirá en Task 8).
 * Solo para probar el resolver con mensaje truncado a 20 filas.
 */
function buildCompanyMismatchErrorLikeTask8(
  offendingRows: EmployeeImportCompanyMismatchRow[],
  activeName: string
) {
  const labelOf = (item: EmployeeImportCompanyMismatchRow): string =>
    item.businessUnit !== '' ? item.businessUnit : item.payrollBusinessUnit
  const shown = offendingRows.slice(0, 20)
  const listing = shown.map((item) => `fila ${item.row} («${labelOf(item)}»)`).join(', ')
  const tail =
    offendingRows.length > shown.length
      ? ` … y ${offendingRows.length - shown.length} filas más.`
      : ''
  return Object.assign(
    new Error(
      `La empresa activa es «${activeName}». Estas filas declaran otra: ${listing}.${tail} No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.`
    ),
    {
      isCompanyMismatchError: true as const,
      statusCode: 409 as const,
      offendingRows,
    }
  )
}

test.group('rechazo por empresa distinta — resolvedor', () => {
  test('isCompanyMismatchError resuelve 409 con key, code y todas las filas ofensoras', ({ assert }) => {
    const offendingRows = [
      { row: 3, businessUnit: 'Empresa B', payrollBusinessUnit: 'Empresa A' },
      { row: 5, businessUnit: 'Empresa A', payrollBusinessUnit: 'Empresa B' },
    ]
    const error = new Error('El archivo declara una empresa distinta de la activa en 2 fila(s).')
    ;(error as any).isCompanyMismatchError = true
    ;(error as any).statusCode = 409
    ;(error as any).offendingRows = offendingRows

    const resolved = resolveEmployeeImportApiError(error, 409)

    assert.equal(resolved.status, 409)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_BUSINESS_UNIT)
    assert.equal(resolved.key, 'archivo-de-otra-empresa')
    assert.equal(resolved.title, 'El archivo tiene empleados de otra empresa')
    assert.isString(resolved.detail)
    assert.deepEqual((resolved.data as { offendingRows: unknown }).offendingRows, offendingRows)
  })

  test('tope de 20 filas en message/detail: cita 20 y cierra con … y N filas más.', ({ assert }) => {
    const offendingRows: EmployeeImportCompanyMismatchRow[] = Array.from({ length: 21 }, (_, index) => ({
      row: index + 2,
      businessUnit: `Empresa X ${index + 2}`,
      payrollBusinessUnit: '',
    }))
    const error = buildCompanyMismatchErrorLikeTask8(offendingRows, 'Empresa activa QA')

    const resolved = resolveEmployeeImportApiError(error, 409)

    assert.include(resolved.message, '… y 1 filas más.')
    assert.include(resolved.detail, '… y 1 filas más.')
    assert.notInclude(resolved.message, 'fila 22')
    assert.notInclude(resolved.detail, 'fila 22')
    const citedRows = (resolved.message.match(/fila \d+/g) ?? []).length
    assert.equal(citedRows, 20)
  })

  test('fuera de message/detail el cuerpo no incluye datos personales del error crudo', ({ assert }) => {
    const hash = 'a'.repeat(64)
    const dirtyMessage = `ER_DUP_ENTRY valor privado para person_curp ${hash}`
    const error = Object.assign(new Error(dirtyMessage), {
      isCompanyMismatchError: true,
      offendingRows: [
        { row: 2, businessUnit: 'Empresa B', payrollBusinessUnit: 'Empresa B' },
      ],
    })

    const resolved = resolveEmployeeImportApiError(error, 409)
    // `message` y `detail` propagan `err.message` literalmente por contrato.
    assert.equal(resolved.message, dirtyMessage)
    assert.equal(resolved.detail, dirtyMessage)
    const raw = JSON.stringify(resolved, (key, value) =>
      key === 'message' || key === 'detail' ? undefined : value
    )
    assert.notMatch(raw, /CURP|RFC|NSS|person_|ER_DUP_ENTRY|[0-9a-f]{64}/i)
  })

  test('un error común no toma la rama de empresa distinta', ({ assert }) => {
    const resolved = resolveEmployeeImportApiError(new Error('Fila vacía o sin datos de empleado'), 400)
    assert.notEqual(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_BUSINESS_UNIT)
  })
})

test.group('regla 5 — predicado de detención', () => {
  test('el fallo de dato protegido detiene; cualquier otro error no', ({ assert }) => {
    const sensitive = new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'identificacion')
    assert.isTrue(shouldAbortImportOnRowError(sensitive))
    assert.isFalse(shouldAbortImportOnRowError(new Error('CURP duplicado')))
    assert.isFalse(shouldAbortImportOnRowError(null))
  })
})
