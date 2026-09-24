/**
 * Formato neutral de todo archivo descargable que genera el API: reportes
 * Excel y PDF, plantillas de importación, carta de separación y gafete.
 *
 * Decisión de producto (2026-09-22): ningún descargable lleva logotipos
 * (ni de la empresa cliente ni de Valanserh), franjas con marca ni colores
 * corporativos. Todo sale en escala de grises con texto negro, para que el
 * archivo se pueda reenviar, imprimir o anexar a un expediente sin cargar la
 * identidad de nadie.
 *
 * Los colores de estatus (asistencia, retardo, falta, vigente) NO son marca:
 * transmiten información y se conservan donde ya existen.
 *
 * Excel usa ARGB de 8 caracteres; PDF y canvas usan hex con `#`.
 */

/** Paleta neutral en ARGB para exceljs. */
export const REPORT_NEUTRAL_ARGB = {
  /** Texto principal y títulos. */
  text: 'FF000000',
  /** Texto secundario (periodo, notas, pies). */
  textMuted: 'FF595959',
  /** Texto sobre relleno oscuro, cuando un bloque lo requiera. */
  textInverse: 'FFFFFFFF',
  /** Relleno del encabezado de columnas. */
  headerFill: 'FFD9D9D9',
  /** Relleno de encabezados secundarios, subtotales o columnas obligatorias. */
  subheaderFill: 'FFEDEDED',
  /** Relleno del total general. */
  totalFill: 'FFBFBFBF',
  /** Borde de celdas. */
  border: 'FFBFBFBF',
  /** Fondo blanco. */
  background: 'FFFFFFFF',
} as const

/** Paleta neutral en hex para pdfkit y canvas. */
export const REPORT_NEUTRAL_HEX = {
  text: '#000000',
  textMuted: '#595959',
  textInverse: '#FFFFFF',
  headerFill: '#D9D9D9',
  subheaderFill: '#EDEDED',
  totalFill: '#BFBFBF',
  border: '#BFBFBF',
  background: '#FFFFFF',
} as const

/**
 * Tipografías de los PDF generados con pdfkit. Son las estándar integradas
 * (sin archivos que registrar) y codifican WinAnsi, que cubre acentos, ñ,
 * `§`, `—`, `–` y `•`. Sustituyen a Mulish, que es la tipografía de marca.
 */
export const REPORT_NEUTRAL_PDF_FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
} as const
