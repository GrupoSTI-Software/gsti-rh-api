import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import CalendarExportService from '#services/calendar_export_service'
import ComplaintService, { humanizeCategorySlug } from '#services/complaint_service'
import SupplieService from '#services/supplie_service'
import {
  positionProfileImplementationDate,
  positionProfileIssueDate,
} from '#services/position_service'
import Employee from '#models/employee'
import Person from '#models/person'
import type { ComplaintCategory } from '#constants/complaint'
import type { ComplaintReportResult } from '../../../app/interfaces/complaint_interface.js'

/**
 * Regla de los descargables (2026-09-24): un dato ausente se escribe en
 * blanco. Nunca "null"/"undefined" ni rellenos como "—", "N/A" o "No aplica".
 */
async function loadWorkbook(buffer: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  return workbook
}

function cellTexts(workbook: ExcelJS.Workbook): string[] {
  const texts: string[] = []
  workbook.eachSheet((sheet) =>
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') texts.push(cell.value)
      })
    )
  )
  return texts
}

const FILLER = /^(—|N\/A|No aplica|Sin dato)$/i
const MISSING_TOKEN = /\b(null|undefined)\b/i

test.group('Descargables: dato ausente en blanco', () => {
  test('calendario: un colaborador sin apellidos no sale con "null"', async ({ assert }) => {
    const person = new Person()
    person.personFirstname = 'Lucía'
    person.personBirthday = '1990-05-10'
    const employee = new Employee()
    employee.$setRelated('person', person)

    const workbook = await loadWorkbook(await new CalendarExportService().birthdays([employee], 2026))
    const sheet = workbook.worksheets[0]

    assert.equal(sheet.getCell('C2').value, 'Lucía')
    for (const text of cellTexts(workbook)) assert.notMatch(text, MISSING_TOKEN)
  })

  test('buzón de quejas: una categoría sin traducción sale legible, no como slug', async ({ assert }) => {
    const report: ComplaintReportResult = {
      period: { from: '2026-09-01', to: '2026-09-30' },
      totalVolume: 1,
      // Categoría nueva del catálogo, todavía sin clave de traducción.
      byCategory: [{ category: 'acoso-sexual-digital' as string as ComplaintCategory, count: 1 }],
      averageResolutionTimeHours: null,
      resolvedCasesCount: 0,
    }

    const workbook = await loadWorkbook(await new ComplaintService().buildReportExcel(report))
    const texts = cellTexts(workbook)

    assert.include(texts, 'Acoso sexual digital')
    assert.notInclude(texts, 'acoso-sexual-digital')
    for (const text of texts) {
      assert.notMatch(text, FILLER)
      assert.notMatch(text, MISSING_TOKEN)
    }
  })

  test('humanizeCategorySlug convierte guiones y guiones bajos en texto', ({ assert }) => {
    assert.equal(humanizeCategorySlug('violencia-laboral'), 'Violencia laboral')
    assert.equal(humanizeCategorySlug('OTRO_TIPO'), 'Otro tipo')
    assert.equal(humanizeCategorySlug(''), '')
  })

  test('activos: sin "—" como relleno; "Sin asignar" se conserva como estado', async ({ assert }) => {
    const result = await SupplieService.getExcelReport()
    assert.equal(result.status, 201, result.error)
    const texts = cellTexts(await loadWorkbook(result.buffer as ArrayBuffer))

    for (const text of texts) {
      assert.notMatch(text, FILLER)
      assert.notMatch(text, MISSING_TOKEN)
    }
  })
})

test.group('Perfil de puesto: mismas fechas en PDF y Excel', () => {
  test('fecha de implementación = creación del puesto en dd/MM/yyyy, zona de negocio', ({ assert }) => {
    // 03:00 UTC del 1 de marzo sigue siendo 28 de febrero en México.
    const createdAt = DateTime.fromISO('2026-03-01T03:00:00Z', { zone: 'utc' })
    const text = positionProfileImplementationDate(createdAt)

    assert.match(text, /^\d{2}\/\d{2}\/\d{4}$/)
    assert.notEqual(text, positionProfileIssueDate(DateTime.fromISO('2026-09-24T12:00:00Z')))
  })

  test('sin fecha de creación la fecha de implementación queda en blanco', ({ assert }) => {
    assert.equal(positionProfileImplementationDate(null), '')
    assert.equal(positionProfileImplementationDate(undefined), '')
  })

  test('fecha de emisión en dd/MM/yyyy', ({ assert }) => {
    assert.equal(positionProfileIssueDate(DateTime.fromISO('2026-09-24T18:00:00Z')), '24/09/2026')
  })
})
