import ExcelJS from 'exceljs'
import { blankMissingTexts, reportText } from '#helpers/report_text'
import type { RepseCoverageExportRow } from './dto/repse_coverage_report.dto.js'

/**
 * Formato de las columnas de porcentaje: el encabezado ya dice "%", así que
 * el valor va en la misma escala que la pantalla (100 = 100 %) como número
 * con dos decimales, no como texto: Excel puede sumarlo, filtrarlo y
 * ordenarlo. "Diferencia" está en puntos porcentuales.
 */
export const REPSE_COVERAGE_PERCENT_NUM_FMT = '0.00'

const PERCENT_KEYS = ['porcentajeObservado', 'porcentajeDeclarado', 'diferencia'] as const

/**
 * Libro del reporte de cobertura REPSE. Dato ausente en blanco: sin porcentaje
 * declarado, la celda queda vacía; sin razón social, la empresa queda vacía.
 */
export function buildRepseCoverageWorkbook(rows: RepseCoverageExportRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Reporte REPSE')
  worksheet.columns = [
    { header: 'Empleado', key: 'employeeName', width: 32 },
    { header: 'Código Empleado', key: 'employeeCode', width: 18 },
    { header: 'Empresa Contratante', key: 'companyName', width: 30 },
    { header: 'Días Laborados', key: 'diasLaborados', width: 14 },
    { header: 'Días Base', key: 'diasBase', width: 12 },
    { header: 'Días Prestados', key: 'diasPrestados', width: 14 },
    { header: 'Días Servidos', key: 'diasServidos', width: 14 },
    { header: '% Observado', key: 'porcentajeObservado', width: 12 },
    { header: '% Declarado', key: 'porcentajeDeclarado', width: 12 },
    { header: 'Diferencia', key: 'diferencia', width: 12 },
  ]

  for (const key of PERCENT_KEYS) {
    worksheet.getColumn(key).numFmt = REPSE_COVERAGE_PERCENT_NUM_FMT
  }

  for (const row of rows) {
    worksheet.addRow({
      employeeName: reportText(row.employeeName),
      employeeCode: reportText(row.employeeCode),
      companyName: reportText(row.companyName),
      diasLaborados: row.diasLaborados,
      diasBase: row.diasBase,
      diasPrestados: row.diasPrestados,
      diasServidos: row.diasServidos,
      porcentajeObservado: row.porcentajeObservado,
      porcentajeDeclarado: row.porcentajeDeclarado,
      diferencia: row.diferencia,
    })
  }

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  // El encabezado no lleva formato numérico aunque la columna sí.
  for (const key of PERCENT_KEYS) {
    headerRow.getCell(key).numFmt = 'General'
  }

  blankMissingTexts(workbook)
  return workbook
}
