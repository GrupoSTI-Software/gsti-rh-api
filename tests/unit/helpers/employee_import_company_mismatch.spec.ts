import { test } from '@japa/runner'
import {
  resolveEmployeeImportApiError,
  shouldAbortImportOnRowError,
} from '#helpers/employee_import_api_error'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '#constants/employee_import_error_codes'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

/** USRH1789747321650 reglas 1, 2, 5 y 6 a nivel de contrato (puro, sin BD). */

test.group('rechazo por empresa distinta — resolvedor', () => {
  test('isCompanyMismatchError resuelve 422 con key, code y todas las filas ofensoras', ({ assert }) => {
    const offendingRows = [
      { row: 3, businessUnit: 'Empresa B', payrollBusinessUnit: 'Empresa A' },
      { row: 5, businessUnit: 'Empresa A', payrollBusinessUnit: 'Empresa B' },
    ]
    const error = new Error('El archivo declara una empresa distinta de la activa en 2 fila(s).')
    ;(error as any).isCompanyMismatchError = true
    ;(error as any).statusCode = 422
    ;(error as any).offendingRows = offendingRows

    const resolved = resolveEmployeeImportApiError(error, 422)

    assert.equal(resolved.status, 422)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY)
    assert.equal(resolved.key, 'empresa-distinta-en-archivo')
    assert.isString(resolved.title)
    assert.isString(resolved.detail)
    assert.deepEqual((resolved.data as { offendingRows: unknown }).offendingRows, offendingRows)
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

    const resolved = resolveEmployeeImportApiError(error, 422)
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
    assert.notEqual(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY)
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
