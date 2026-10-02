import type ExcelJS from 'exceljs'

/**
 * Texto de todo archivo descargable: única representación de la regla
 * (2026-09-24). Un dato ausente se escribe en blanco, nunca como "null" ni
 * "undefined": esos textos aparecían al interpolar un apellido vacío
 * (`${firstName} ${lastName} ${secondLastName}`).
 */

const MISSING_TOKEN = /(^|\s)(null|undefined)(?=\s|$)/gi

/** Texto de un dato, en blanco si falta. */
export function reportText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(MISSING_TOKEN, '$1').replace(/\s+/g, ' ').trim()
}

/** Une partes de un nombre omitiendo las vacías (nombre, apellido, segundo apellido). */
export function reportFullName(...parts: unknown[]): string {
  return parts
    .map((part) => reportText(part))
    .filter((part) => part.length > 0)
    .join(' ')
}

/**
 * Red de seguridad antes de escribir un libro: todo texto de celda pasa por
 * `reportText`, así que ningún "null" o "undefined" llega al archivo aunque un
 * generador lo haya interpolado.
 */
export function blankMissingTexts(workbook: ExcelJS.Workbook): void {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value !== 'string') return
        const clean = reportText(cell.value)
        if (clean !== cell.value) cell.value = clean
      })
    })
  })
}
