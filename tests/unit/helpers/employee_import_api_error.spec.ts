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
    assert.notInclude(resolved.detail ?? '', 'SQL')
    assert.notInclude(resolved.message, 'secret')
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
