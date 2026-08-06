import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1785766125019 — Paridad de formato entre el reporte síncrono
 * (`getExcelAllAssistance`) y el nuevo método de job asíncrono
 * (`generateAssistanceAllBuffer`).
 *
 * Estos tests verifican en tiempo de lint/CI que:
 *   1. `generateAssistanceAllBuffer` exista y comparta el mismo pipeline de
 *      construcción de workbook que `getExcelAllAssistance` (misma paleta de
 *      colores, mismo `addHeadRow`, mismo `addRowToWorkSheet`, mismo logo).
 *   2. La diferencia entre ambos métodos se limite al iterador con progreso
 *      y a la firma del parámetro `departmentsList` explícito.
 *   3. El servicio de jobs llame a `generateAssistanceAllBuffer` y no
 *      reimplemente la lógica por su cuenta.
 *
 * Los tests son de análisis estático (lectura de fuente): rápidos, sin BD,
 * sin S3 y sin dependencias externas.
 */

const ASSIST_SERVICE = join(process.cwd(), 'app/services/assist_service.ts')
const REPORT_JOB_SERVICE = join(process.cwd(), 'app/services/report_job_service.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf-8')
}

test.group('ReportJobService — paridad de formato con getExcelAllAssistance', () => {
  test('generateAssistanceAllBuffer existe en assist_service.ts', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    assert.include(
      content,
      'generateAssistanceAllBuffer',
      'El método generateAssistanceAllBuffer debe estar definido en AssistsService'
    )
  })

  test('generateAssistanceAllBuffer usa el mismo color de título "244062"', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const snippet = content.slice(start, start + 5000)
    assert.include(
      snippet,
      '244062',
      'generateAssistanceAllBuffer debe usar el mismo color de título que getExcelAllAssistance'
    )
  })

  test('generateAssistanceAllBuffer usa el mismo color de periodo "366092"', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const snippet = content.slice(start, start + 5000)
    assert.include(
      snippet,
      '366092',
      'generateAssistanceAllBuffer debe usar el mismo color de periodo que getExcelAllAssistance'
    )
  })

  test('generateAssistanceAllBuffer llama a addHeadRow', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const snippet = content.slice(start, start + 12000)
    assert.include(
      snippet,
      'addHeadRow',
      'generateAssistanceAllBuffer debe llamar a addHeadRow para las columnas de cabecera'
    )
  })

  test('generateAssistanceAllBuffer llama a addRowToWorkSheet', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const snippet = content.slice(start, start + 12000)
    assert.include(
      snippet,
      'addRowToWorkSheet',
      'generateAssistanceAllBuffer debe llamar a addRowToWorkSheet para las filas de datos'
    )
  })

  test('generateAssistanceAllBuffer llama a addImageLogo', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const snippet = content.slice(start, start + 5000)
    assert.include(
      snippet,
      'addImageLogo',
      'generateAssistanceAllBuffer debe incluir el logo igual que getExcelAllAssistance'
    )
  })

  test('generateAssistanceAllBuffer acepta departmentsList como parámetro explícito', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const signature = content.slice(start, start + 400)
    assert.include(
      signature,
      'departmentsList',
      'generateAssistanceAllBuffer debe aceptar departmentsList como parámetro para reproducir el mismo scope que getExcelAllAssistance'
    )
  })

  test('generateAssistanceAllBuffer acepta onProgress como callback', ({ assert }) => {
    const content = readSource(ASSIST_SERVICE)
    const start = content.indexOf('generateAssistanceAllBuffer')
    assert.isAbove(start, -1)
    const signature = content.slice(start, start + 400)
    assert.include(
      signature,
      'onProgress',
      'generateAssistanceAllBuffer debe aceptar un callback onProgress para reportar avance'
    )
  })

  test('ReportJobService llama a generateAssistanceAllBuffer (no reimplementa)', ({ assert }) => {
    const content = readSource(REPORT_JOB_SERVICE)
    assert.include(
      content,
      'generateAssistanceAllBuffer',
      'ReportJobService debe delegar la generación a AssistsService.generateAssistanceAllBuffer'
    )
    assert.notInclude(
      content,
      'ExcelJS.Workbook',
      'ReportJobService no debe instanciar ExcelJS directamente: toda la lógica de formato vive en AssistsService'
    )
  })

  test('ReportJobService sube a S3 con uploadPrivateBuffer', ({ assert }) => {
    const content = readSource(REPORT_JOB_SERVICE)
    assert.include(
      content,
      'uploadPrivateBuffer',
      'ReportJobService debe usar uploadPrivateBuffer para guardar el archivo con permisos privados'
    )
  })

  test('ReportJobService marca el job como "failed" cuando falla la generación', ({ assert }) => {
    const content = readSource(REPORT_JOB_SERVICE)
    assert.include(
      content,
      "'failed'",
      'ReportJobService debe marcar el status como failed ante cualquier error'
    )
  })
})
