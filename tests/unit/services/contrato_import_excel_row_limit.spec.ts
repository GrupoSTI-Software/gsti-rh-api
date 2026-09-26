import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { CONTRATO_IMPORT_UPLOAD } from '../../../app/constants/contrato_servicio_especializado_error_codes.js'

const SERVICE_FILE = join(
  process.cwd(),
  'app/services/contrato_servicio_especializado_import_service.ts'
)

test.group('contrato_servicio_especializado_import_service — tope de filas por archivo', () => {
  test('rechaza archivos con más filas que CONTRATO_IMPORT_UPLOAD.maxDataRows, ANTES de procesar filas', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'CONTRATO_IMPORT_UPLOAD')
    assert.include(content, 'private countDataRows(sheet: ExcelJS.Worksheet, headerMap: HeaderIndexMap)')
    assert.include(content, 'if (dataRowCount > CONTRATO_IMPORT_UPLOAD.maxDataRows)')
    assert.include(content, 'throw this.filasExcedidas(dataRowCount)')
    assert.include(content, "'filas-excedidas'")
  })

  test('el tope de filas es un único valor en CONTRATO_IMPORT_UPLOAD.maxDataRows, sin variable de entorno', ({
    assert,
  }) => {
    assert.equal(CONTRATO_IMPORT_UPLOAD.maxDataRows, 500)

    const constantsContent = readFileSync(
      join(process.cwd(), 'app/constants/contrato_servicio_especializado_error_codes.ts'),
      'utf-8'
    )
    assert.notMatch(constantsContent, /process\.env/)
  })
})
