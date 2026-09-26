import { test } from '@japa/runner'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '../../../app/constants/employee_import_error_codes.js'
import {
  resolveEmployeeImportApiError,
  resolveEmployeeImportValFileError,
} from '../../../app/helpers/employee_import_api_error.js'

test.group('employee_import_api_error', () => {
  test('resolveEmployeeImportValFileError missing incluye campo multipart file', ({ assert }) => {
    const resolved = resolveEmployeeImportValFileError(undefined, { reason: 'missing' })

    assert.equal(resolved.status, 400)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_FILE)
    assert.equal(resolved.data?.multipartField, 'file')
    assert.deepEqual(resolved.data?.acceptedExtensions, ['.xlsx', '.xls'])
    assert.include(resolved.detail ?? '', 'file')
  })

  test('resolveEmployeeImportValFileError too_large incluye límite en data', ({ assert }) => {
    const resolved = resolveEmployeeImportValFileError(undefined, { reason: 'too_large' })

    assert.equal(resolved.data?.maxFileBytes, 10 * 1024 * 1024)
    assert.include(resolved.detail ?? '', '10 MB')
  })

  test('resolveEmployeeImportApiError mapea cabeceras inválidas', ({ assert }) => {
    const headerError = Object.assign(new Error('Faltan encabezados'), {
      isHeaderValidationError: true,
      statusCode: 400,
    })

    const resolved = resolveEmployeeImportApiError(headerError, 400, undefined)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_HEADERS)
    assert.equal(resolved.key, 'cabeceras-invalidas')
    assert.equal(resolved.detail, 'Faltan encabezados')
  })

  test('resolveEmployeeImportApiError mapea tope de filas excedido', ({ assert }) => {
    const rowLimitError = Object.assign(
      new Error('El archivo tiene 800 filas de datos, por encima del máximo permitido (500). Divide el archivo en lotes más pequeños.'),
      { isRowLimitError: true, statusCode: 400 }
    )

    const resolved = resolveEmployeeImportApiError(rowLimitError, 400, undefined)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_ROWS)
    assert.equal(resolved.key, 'filas-excedidas')
    assert.include(resolved.detail ?? '', '800')
    assert.include(resolved.detail ?? '', '500')
  })

  test('resolveEmployeeImportApiError no expone mensaje interno en 500', ({ assert }) => {
    const internal = new Error('SQL connection leaked /tmp/secret')

    const resolved = resolveEmployeeImportApiError(internal, 500, undefined)

    assert.equal(resolved.status, 500)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.SERVER)
    assert.equal(resolved.key, 'error-importacion')
    assert.equal(resolved.title, 'Error del servidor')
    assert.equal(resolved.detail, 'Ocurrió un error inesperado durante la importación.')
    assert.equal(resolved.message, resolved.detail)
    assert.notInclude(resolved.detail ?? '', 'SQL')
    assert.notInclude(resolved.message, 'secret')
  })

  test('sin 4.º argumento el 500 de empleados queda byte a byte igual (R-5)', ({ assert }) => {
    const internal = new Error('SELECT * FROM employees WHERE secret=1')
    const withUndefined = resolveEmployeeImportApiError(internal, 500, undefined, undefined)
    const withoutFourth = resolveEmployeeImportApiError(internal, 500, undefined)

    assert.deepEqual(withUndefined, withoutFourth)
    assert.equal(withoutFourth.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.SERVER)
    assert.equal(withoutFourth.key, 'error-importacion')
  })

  test('serverOverride solo altera code y key del 500; detail sigue genérico', ({ assert }) => {
    const internal = new Error('ExcelJS: /var/app/tmp/upload.xlsx ENOENT')

    const shifts = resolveEmployeeImportApiError(internal, 500, undefined, {
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS,
      key: 'error-importacion-turnos',
    })
    const vacations = resolveEmployeeImportApiError(internal, 500, undefined, {
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS,
      key: 'error-importacion-vacaciones',
    })

    assert.equal(shifts.errorCode, 'EMP.IMPORT.SERVER_SHIFTS')
    assert.equal(shifts.key, 'error-importacion-turnos')
    assert.equal(vacations.errorCode, 'EMP.IMPORT.SERVER_VACATIONS')
    assert.equal(vacations.key, 'error-importacion-vacaciones')

    for (const resolved of [shifts, vacations]) {
      assert.equal(resolved.status, 500)
      assert.equal(resolved.detail, 'Ocurrió un error inesperado durante la importación.')
      assert.equal(resolved.message, resolved.detail)
      assert.notInclude(resolved.detail ?? '', 'ExcelJS')
      assert.notInclude(resolved.detail ?? '', '/var/app')
      assert.notInclude(resolved.message, 'ENOENT')
    }
  })

  test('serverOverride no se cuela en los branches de 400', ({ assert }) => {
    const headerError = Object.assign(new Error('Faltan encabezados'), {
      isHeaderValidationError: true,
      statusCode: 400,
    })
    const override = {
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS,
      key: 'error-importacion-turnos',
    }

    const resolved = resolveEmployeeImportApiError(headerError, 400, undefined, override)

    assert.equal(resolved.status, 400)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_HEADERS)
    assert.equal(resolved.key, 'cabeceras-invalidas')
  })

  test('códigos nuevos de turnos y vacaciones conviven con SERVER', ({ assert }) => {
    assert.equal(EMPLOYEE_IMPORT_ERROR_CODES.SERVER, 'EMP.IMPORT.SERVER')
    assert.equal(EMPLOYEE_IMPORT_ERROR_CODES.SERVER_SHIFTS, 'EMP.IMPORT.SERVER_SHIFTS')
    assert.equal(EMPLOYEE_IMPORT_ERROR_CODES.SERVER_VACATIONS, 'EMP.IMPORT.SERVER_VACATIONS')
  })
})

test.group('employee_import legacy alias', () => {
  test('formato legado derivado de rowErrors y warnings', ({ assert }) => {
    const rowErrors = [
      { row: 5, field: 'Nombre del empleado', message: 'Falta el campo obligatorio' },
      { row: 7, message: 'CURP duplicado' },
    ]
    const warnings = ['Fila 3 · aviso híbrido']

    const legacy = [
      ...rowErrors.map((item) => `Fila ${item.row}: ${item.message}`),
      ...warnings,
    ]

    assert.deepEqual(legacy, [
      'Fila 5: Falta el campo obligatorio',
      'Fila 7: CURP duplicado',
      'Fila 3 · aviso híbrido',
    ])
  })

  test('failed cuenta filas distintas en rowErrors', ({ assert }) => {
    const rowErrors = [
      { row: 5, field: 'Nombre del empleado', message: 'Falta el campo obligatorio' },
      { row: 5, field: 'Identificador de nómina', message: 'Falta el campo obligatorio' },
    ]

    const failed = new Set(rowErrors.map((item) => item.row)).size

    assert.equal(failed, 1)
    assert.equal(rowErrors.length, 2)
  })
})
