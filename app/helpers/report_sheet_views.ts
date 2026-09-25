import type ExcelJS from 'exceljs'

/**
 * Vista de una hoja de reporte con las filas `1..headerRow` congeladas: única
 * representación de la regla (2026-09-24).
 *
 * Una sola entrada: ExcelJS escribe un `<sheetView>` por cada elemento de
 * `worksheet.views` y Excel solo aplica el primero, así que con varias se
 * congelaba la fila 1 y no el encabezado. `topLeftCell` va debajo de lo
 * congelado; dentro de las filas fijas, Excel da el libro por dañado.
 */
export function frozenHeaderViews(headerRow: number): Array<Partial<ExcelJS.WorksheetViewFrozen>> {
  return [{ state: 'frozen', ySplit: headerRow, topLeftCell: `A${headerRow + 1}` }]
}
