import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import logger from '@adonisjs/core/services/logger'
import ContratoServicioEspecializadoService, {
  type ContratoServicioEspecializadoCreatePayload,
} from '#services/contrato_servicio_especializado_service'
import EmpresaContratanteService from '#services/empresa_contratante_service'
import type {
  CompromisoDocumental,
  CompromisoDocumentalPeriodicidad,
  CompromisoDocumentalTipo,
} from '#models/clausula_15d'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES, CONTRATO_IMPORT_UPLOAD } from '../constants/contrato_servicio_especializado_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { resolveContratoServicioEspecializadoApiError } from '../helpers/contrato_servicio_especializado_api_error.js'
import { findRepseSpecializedServicesByNamesInTenant } from '../helpers/repse_tenant_scope.js'
import { normalizeRfc } from '../shared/validators/rfc.validator.js'

/**
 * Motor de importación de contratos de servicios especializados por Excel
 * (USRH1785509296682). Reúsa `ContratoServicioEspecializadoService#create`
 * fila por fila: no duplica la validación de negocio (fechas, folio REPSE,
 * unicidad de número, servicios registrados), solo resuelve dependencias
 * propias de la carga masiva (contratante por RFC, servicios por nombre,
 * celdas compuestas, dedup intra-archivo) y traduce cada fallo a un motivo
 * de fila estable.
 *
 * Procesamiento secuencial y sin transacción global (regla 7 de la HU):
 * cada fila se crea o se rechaza de forma independiente dentro de su propia
 * transacción (la que ya abre `create`), sin `Promise.all` y sin acumular
 * workbooks intermedios en memoria más allá del propio archivo leído.
 */

interface ContratoImportFieldDefinition {
  key: ContratoImportFieldKey
  header: string
  required: boolean
}

type ContratoImportFieldKey =
  | 'rfcContratante'
  | 'numeroContrato'
  | 'fechaInicio'
  | 'fechaFin'
  | 'objetoServicio'
  | 'montoTotal'
  | 'moneda'
  | 'anexoObjetoDetallado'
  | 'anexoNumeroTrabajadores'
  | 'anexoFechaInicioServicio'
  | 'anexoFechaFinServicio'
  | 'anexoCompromisos'
  | 'anexoResponsabilidadSolidaria'
  | 'serviciosRegistrados'

/** Diccionario fijo de columnas de la plantilla (cabecera canónica = fila 1). */
const CONTRATO_IMPORT_FIELDS: readonly ContratoImportFieldDefinition[] = [
  { key: 'rfcContratante', header: 'RFC contratante', required: true },
  { key: 'numeroContrato', header: 'Número de contrato', required: true },
  { key: 'fechaInicio', header: 'Fecha inicio', required: true },
  { key: 'fechaFin', header: 'Fecha fin', required: false },
  { key: 'objetoServicio', header: 'Objeto del servicio', required: true },
  { key: 'montoTotal', header: 'Monto total', required: false },
  { key: 'moneda', header: 'Moneda', required: false },
  { key: 'anexoObjetoDetallado', header: 'Anexo - Objeto detallado', required: true },
  { key: 'anexoNumeroTrabajadores', header: 'Anexo - Número de trabajadores', required: true },
  { key: 'anexoFechaInicioServicio', header: 'Anexo - Fecha inicio servicio', required: true },
  { key: 'anexoFechaFinServicio', header: 'Anexo - Fecha fin servicio', required: false },
  { key: 'anexoCompromisos', header: 'Anexo - Compromisos documentales', required: true },
  { key: 'anexoResponsabilidadSolidaria', header: 'Anexo - Responsabilidad solidaria', required: true },
  { key: 'serviciosRegistrados', header: 'Servicios registrados', required: true },
]

const COMPROMISO_TIPOS: readonly CompromisoDocumentalTipo[] = [
  'cfdi_nomina',
  'comprobante_imss',
  'comprobante_infonavit',
  'otro',
]

const COMPROMISO_PERIODICIDADES: readonly CompromisoDocumentalPeriodicidad[] = [
  'mensual',
  'bimestral',
  'cuatrimestral',
  'anual',
  'por_evento',
]

export interface ContratoImportRowErrorEntry {
  row: number
  motivo: string
  key: string
  code: string
}

export interface ContratoImportSummary {
  totalRows: number
  created: number
  rejected: number
}

export interface ContratoImportResult {
  summary: ContratoImportSummary
  rowErrors: ContratoImportRowErrorEntry[]
  warnings: string[]
}

type HeaderIndexMap = Record<ContratoImportFieldKey, number>

/**
 * Error de fila o de archivo del motor de importación. Cuando se lanza
 * antes del ciclo por fila (archivo inválido, cabeceras no emparejables)
 * se propaga al controller como error global; cuando se lanza dentro del
 * ciclo, se captura y se convierte en una entrada de `rowErrors`.
 */
class ContratoImportRowError extends Error {
  readonly key: string
  readonly code: string

  constructor(motivo: string, key: string, code: string) {
    super(motivo)
    this.name = 'ContratoImportRowError'
    this.key = key
    this.code = code
  }
}

/** Normaliza texto de cabecera: sin acentos, minúsculas, espacios colapsados. */
function normalizeHeaderText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Extrae el texto de una celda de ExcelJS (soporta richText) ya con trim. */
function cellToTrimmedString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate() ?? ''
  }
  if (typeof value === 'object') {
    const withRichText = value as { richText?: Array<{ text?: string }>; text?: string }
    if (Array.isArray(withRichText.richText)) {
      return withRichText.richText
        .map((fragment) => fragment.text ?? '')
        .join('')
        .trim()
    }
    if (typeof withRichText.text === 'string') {
      return withRichText.text.trim()
    }
    return ''
  }
  return String(value).trim()
}

/**
 * Parser puro y testeable de la celda compuesta de compromisos documentales
 * del anexo 15-D. Formato: `tipo|descripcion|periodicidad` con varios
 * compromisos separados por `;`. Lanza `Error` genérico ante cualquier
 * desviación del formato; el caller decide el motivo exacto de la fila.
 */
export function parseCompromisosCell(raw: string): CompromisoDocumental[] {
  const segments = raw
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (segments.length === 0) {
    throw new Error('compromisos-vacio')
  }

  return segments.map((segment) => {
    const parts = segment.split('|').map((part) => part.trim())
    if (parts.length !== 3) {
      throw new Error('compromiso-formato')
    }
    const [tipoRaw, descripcion, periodicidadRaw] = parts
    const tipo = tipoRaw.toLowerCase() as CompromisoDocumentalTipo
    const periodicidad = periodicidadRaw.toLowerCase() as CompromisoDocumentalPeriodicidad

    if (!COMPROMISO_TIPOS.includes(tipo)) {
      throw new Error('compromiso-tipo')
    }
    if (!COMPROMISO_PERIODICIDADES.includes(periodicidad)) {
      throw new Error('compromiso-periodicidad')
    }
    if (descripcion.length < 1 || descripcion.length > 500) {
      throw new Error('compromiso-descripcion')
    }

    return { tipo, descripcion, periodicidad }
  })
}

/**
 * Parser puro de la celda compuesta de servicios registrados: nombres
 * separados por `;`. La resolución contra el catálogo del tenant la hace
 * el caller (`findRepseSpecializedServicesByNamesInTenant`).
 */
export function parseServiciosCell(raw: string): string[] {
  return raw
    .split(';')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

export default class ContratoServicioEspecializadoImportService {
  private readonly i18n?: I18n
  private readonly contratoService = new ContratoServicioEspecializadoService()
  private readonly contratanteService = new EmpresaContratanteService()

  constructor(i18n?: I18n) {
    this.i18n = i18n
  }

  /**
   * Genera la plantilla descargable: hoja "Contratos" (cabeceras + fila de
   * ejemplo) y hoja "Instrucciones" (formato de compuestas, enums, ejemplos).
   */
  async generateImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Contratos')

    sheet.addRow(CONTRATO_IMPORT_FIELDS.map((field) => field.header))
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
    })

    sheet.addRow([
      'XAXX010101000',
      'CSE-2026-EJEMPLO-001',
      '2026-01-15',
      '2026-12-31',
      'Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.',
      450000,
      'MXN',
      'Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.',
      12,
      '2026-01-15',
      '2026-12-31',
      'cfdi_nomina|Entrega mensual de CFDI de nómina por cada trabajador asignado al servicio|mensual;comprobante_imss|Comprobante de pago de cuotas obrero-patronales ante el IMSS|bimestral',
      'Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.',
      'Nombre del servicio registrado 1;Nombre del servicio registrado 2',
    ])

    CONTRATO_IMPORT_FIELDS.forEach((_field, index) => {
      sheet.getColumn(index + 1).width = 34
    })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    this.appendInstructionsSheet(workbook)

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  private appendInstructionsSheet(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet('Instrucciones')
    const lines: Array<[string, boolean]> = [
      [
        'INSTRUCCIONES DE USO - PLANTILLA DE IMPORTACIÓN DE CONTRATOS DE SERVICIOS ESPECIALIZADOS',
        true,
      ],
      ['', false],
      [
        '1. Hoja "Contratos": una fila por contrato. No modifique ni reordene la fila 1 (cabeceras).',
        false,
      ],
      [
        '2. RFC contratante: debe existir en su catálogo de empresas contratantes del módulo REPSE. Esta importación no crea contratantes nuevos.',
        false,
      ],
      ['3. Fechas en formato AAAA-MM-DD, por ejemplo 2026-01-15.', false],
      [
        '4. Número de contrato: único. No se permite repetir contra contratos existentes ni entre filas de este mismo archivo.',
        false,
      ],
      [
        '5. Anexo - Compromisos documentales: formato "tipo|descripción|periodicidad"; varios compromisos separados por punto y coma (;).',
        false,
      ],
      ['   Tipos válidos: cfdi_nomina, comprobante_imss, comprobante_infonavit, otro.', false],
      [
        '   Periodicidades válidas: mensual, bimestral, cuatrimestral, anual, por_evento.',
        false,
      ],
      [
        '   Ejemplo: cfdi_nomina|Entrega mensual de CFDI de nómina|mensual;comprobante_imss|Comprobante IMSS|bimestral',
        false,
      ],
      [
        '6. Servicios registrados: nombres exactos de servicios ya registrados en su catálogo REPSE, separados por punto y coma (;). Indique al menos uno.',
        false,
      ],
      [
        '7. Una fila inválida se rechaza con su motivo específico; las demás filas válidas del archivo se importan igual.',
        false,
      ],
      [
        '8. El contrato se crea en estado borrador, listo para formalizarse. El documento firmado se sube por su vía propia.',
        false,
      ],
      [
        `9. Máximo ${CONTRATO_IMPORT_UPLOAD.maxDataRows} filas de datos por archivo (sin contar la cabecera). Si necesita importar más contratos, divida el archivo en lotes.`,
        false,
      ],
    ]

    lines.forEach(([text, isBold]) => {
      const row = sheet.addRow([text])
      row.getCell(1).font = {
        bold: isBold,
        size: isBold ? 12 : 10,
        color: { argb: isBold ? 'FF1F3864' : 'FF000000' },
      }
      row.height = isBold ? 22 : 16
    })
    sheet.getColumn(1).width = 110
  }

  /**
   * Procesa el archivo subido fila por fila. Lanza `ContratoImportRowError`
   * (archivo/cabeceras) solo cuando el problema impide procesar cualquier
   * fila; cualquier otro fallo se captura por fila y se reporta en
   * `rowErrors`, sin detener el procesamiento de las demás.
   */
  async importFromExcel(tmpPath: string): Promise<ContratoImportResult> {
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.readFile(tmpPath)
    } catch (error) {
      logger.warn({ err: error }, 'Archivo de importación de contratos de servicios especializados inválido')
      throw this.archivoInvalido()
    }

    const sheet = workbook.worksheets[0]
    if (!sheet) {
      throw this.archivoInvalido()
    }

    const headerMap = this.buildHeaderIndexMap(sheet.getRow(1))
    if (!headerMap) {
      throw this.cabecerasInvalidas()
    }

    const dataRowCount = this.countDataRows(sheet, headerMap)
    if (dataRowCount > CONTRATO_IMPORT_UPLOAD.maxDataRows) {
      throw this.filasExcedidas(dataRowCount)
    }

    const rowErrors: ContratoImportRowErrorEntry[] = []
    const createdNumeros = new Set<string>()
    let totalRows = 0
    let created = 0

    const lastRowNumber = sheet.lastRow ? sheet.lastRow.number : 1
    for (let rowNumber = 2; rowNumber <= lastRowNumber; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      if (this.isRowBlank(row, headerMap)) {
        continue
      }
      totalRows++

      try {
        const payload = await this.buildPayloadForRow(row, headerMap, createdNumeros)
        await this.contratoService.create(payload)
        createdNumeros.add(payload.numeroContrato)
        created++
      } catch (error) {
        rowErrors.push(this.mapRowError(rowNumber, error))
      }
    }

    return {
      summary: { totalRows, created, rejected: rowErrors.length },
      rowErrors,
      warnings: [],
    }
  }

  private buildHeaderIndexMap(headerRow: ExcelJS.Row): HeaderIndexMap | null {
    const normalizedToKey = new Map(
      CONTRATO_IMPORT_FIELDS.map((field) => [normalizeHeaderText(field.header), field.key])
    )
    const map: Partial<HeaderIndexMap> = {}

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = normalizedToKey.get(normalizeHeaderText(cellToTrimmedString(cell.value)))
      if (key) {
        map[key] = colNumber
      }
    })

    const hasAllHeaders = CONTRATO_IMPORT_FIELDS.every((field) => map[field.key] !== undefined)
    return hasAllHeaders ? (map as HeaderIndexMap) : null
  }

  private isRowBlank(row: ExcelJS.Row, headerMap: HeaderIndexMap): boolean {
    return CONTRATO_IMPORT_FIELDS.every((field) => {
      const value = row.getCell(headerMap[field.key]).value
      return value === null || value === undefined || cellToTrimmedString(value).length === 0
    })
  }

  private countDataRows(sheet: ExcelJS.Worksheet, headerMap: HeaderIndexMap): number {
    let count = 0
    const lastRowNumber = sheet.lastRow ? sheet.lastRow.number : 1
    for (let rowNumber = 2; rowNumber <= lastRowNumber; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      if (!this.isRowBlank(row, headerMap)) {
        count++
      }
    }
    return count
  }

  private readField(row: ExcelJS.Row, headerMap: HeaderIndexMap, key: ContratoImportFieldKey) {
    const cell = row.getCell(headerMap[key])
    return { raw: cellToTrimmedString(cell.value), cellValue: cell.value }
  }

  private async buildPayloadForRow(
    row: ExcelJS.Row,
    headerMap: HeaderIndexMap,
    createdNumeros: Set<string>
  ): Promise<ContratoServicioEspecializadoCreatePayload> {
    const fields = Object.fromEntries(
      CONTRATO_IMPORT_FIELDS.map((field) => [field.key, this.readField(row, headerMap, field.key)])
    ) as Record<ContratoImportFieldKey, { raw: string; cellValue: ExcelJS.CellValue }>

    for (const field of CONTRATO_IMPORT_FIELDS) {
      if (field.required && fields[field.key].raw.length === 0) {
        throw this.campoObligatorio(field.header)
      }
    }

    const rfc = normalizeRfc(fields.rfcContratante.raw)
    const numeroContrato = fields.numeroContrato.raw
    if (numeroContrato.length > 50) {
      throw this.campoInvalido('Número de contrato', 'debe tener máximo 50 caracteres.')
    }
    if (createdNumeros.has(numeroContrato)) {
      throw this.numeroDuplicadoEnArchivo(numeroContrato)
    }

    const fechaInicio = this.parseRequiredDate(fields.fechaInicio, 'Fecha inicio')
    const fechaFin = this.parseOptionalDate(fields.fechaFin, 'Fecha fin')

    const objetoServicio = fields.objetoServicio.raw
    this.assertLength('Objeto del servicio', objetoServicio, 10, 2000)

    const montoTotal = this.parseOptionalAmount(fields.montoTotal, 'Monto total')
    const moneda = this.parseOptionalMoneda(fields.moneda)

    const anexoObjetoDetallado = fields.anexoObjetoDetallado.raw
    this.assertLength('Anexo - Objeto detallado', anexoObjetoDetallado, 20, 3000)

    const anexoNumeroTrabajadores = this.parseRequiredPositiveInt(
      fields.anexoNumeroTrabajadores,
      'Anexo - Número de trabajadores'
    )
    const anexoFechaInicioServicio = this.parseRequiredDate(
      fields.anexoFechaInicioServicio,
      'Anexo - Fecha inicio servicio'
    )
    const anexoFechaFinServicio = this.parseOptionalDate(
      fields.anexoFechaFinServicio,
      'Anexo - Fecha fin servicio'
    )

    const anexoResponsabilidadSolidaria = fields.anexoResponsabilidadSolidaria.raw
    this.assertLength(
      'Anexo - Responsabilidad solidaria',
      anexoResponsabilidadSolidaria,
      50,
      3000
    )

    const compromisosDocumentales = this.parseCompromisosField(fields.anexoCompromisos.raw)
    const nombresServicios = parseServiciosCell(fields.serviciosRegistrados.raw)

    const contratante = await this.contratanteService.findByRfcInTenant(rfc)
    if (!contratante) {
      throw this.rfcNoEncontrado(rfc)
    }

    const { found, missing } = await findRepseSpecializedServicesByNamesInTenant(nombresServicios)
    if (missing.length > 0) {
      throw this.serviciosNoEncontrados(missing)
    }

    return {
      empresaContratanteId: contratante.empresaContratanteId,
      numeroContrato,
      fechaInicio,
      fechaFin,
      objetoServicio,
      montoTotal,
      moneda,
      anexo15d: {
        objetoDetallado: anexoObjetoDetallado,
        numeroTrabajadoresAprox: anexoNumeroTrabajadores,
        fechaInicioServicio: anexoFechaInicioServicio,
        fechaFinServicio: anexoFechaFinServicio,
        compromisosDocumentales,
        textoResponsabilidadSolidaria: anexoResponsabilidadSolidaria,
      },
      serviciosRegistradosIds: found.map((servicio) => servicio.repseSpecializedServiceId),
    }
  }

  // ---------------------------------------------------------------------------
  // Parseo y validación de campos base (formato/tipo). Las reglas de negocio
  // (coherencia de fechas, longitudes del contrato/anexo, folio REPSE) las
  // sigue validando `create()`; aquí solo se garantiza que el tipo de dato
  // que se le entrega sea el esperado, ya que este flujo no pasa por VineJS.
  // ---------------------------------------------------------------------------

  private parseRequiredDate(
    field: { raw: string; cellValue: ExcelJS.CellValue },
    label: string
  ): Date {
    if (field.cellValue instanceof Date) {
      return field.cellValue
    }
    const parsed = DateTime.fromFormat(field.raw, 'yyyy-MM-dd')
    if (parsed.isValid) {
      return parsed.toJSDate()
    }
    throw this.campoInvalido(label, 'debe tener formato de fecha AAAA-MM-DD.')
  }

  private parseOptionalDate(
    field: { raw: string; cellValue: ExcelJS.CellValue },
    label: string
  ): Date | null {
    if (field.raw.length === 0) {
      return null
    }
    return this.parseRequiredDate(field, label)
  }

  private parseRequiredPositiveInt(
    field: { raw: string; cellValue: ExcelJS.CellValue },
    label: string
  ): number {
    const value = typeof field.cellValue === 'number' ? field.cellValue : Number(field.raw)
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw this.campoInvalido(label, 'debe ser un número entero mayor o igual a 1.')
    }
    return value
  }

  private parseOptionalAmount(
    field: { raw: string; cellValue: ExcelJS.CellValue },
    label: string
  ): number | null {
    if (field.raw.length === 0) {
      return null
    }
    const value =
      typeof field.cellValue === 'number'
        ? field.cellValue
        : Number(field.raw.replace(/,/g, ''))
    if (!Number.isFinite(value) || value < 0) {
      throw this.campoInvalido(label, 'debe ser un número mayor o igual a 0.')
    }
    return Math.round(value * 100) / 100
  }

  private parseOptionalMoneda(field: { raw: string; cellValue: ExcelJS.CellValue }): string | undefined {
    if (field.raw.length === 0) {
      return undefined
    }
    if (!/^[A-Za-z]{3}$/.test(field.raw)) {
      throw this.campoInvalido('Moneda', 'debe tener exactamente 3 letras (ej. MXN).')
    }
    return field.raw.toUpperCase()
  }

  private assertLength(label: string, value: string, min: number, max: number): void {
    if (value.length < min || value.length > max) {
      throw this.campoInvalido(label, `debe tener entre ${min} y ${max} caracteres.`)
    }
  }

  private parseCompromisosField(raw: string): CompromisoDocumental[] {
    try {
      return parseCompromisosCell(raw)
    } catch {
      throw this.celdaInvalida(
        'Anexo - Compromisos documentales',
        'use "tipo|descripción|periodicidad" separado por punto y coma; tipos: cfdi_nomina, comprobante_imss, comprobante_infonavit, otro; periodicidades: mensual, bimestral, cuatrimestral, anual, por_evento'
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Construcción de errores de fila/archivo con traducción i18n.
  // ---------------------------------------------------------------------------

  private archivoInvalido(): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_archivo_invalido_message',
      undefined,
      'El archivo no es un Excel (.xlsx) válido.',
      'archivo-no-excel',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_ARCHIVO
    )
  }

  private cabecerasInvalidas(): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_cabeceras_invalidas_message',
      undefined,
      'No se pudieron emparejar las cabeceras del archivo con la plantilla. Descargue la plantilla vigente y no modifique la fila 1.',
      'cabeceras-invalidas',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_HEADERS
    )
  }

  private filasExcedidas(rowCount: number): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_filas_excedidas_message',
      { rowCount, maxRows: CONTRATO_IMPORT_UPLOAD.maxDataRows },
      `El archivo tiene ${rowCount} filas de datos, por encima del máximo permitido (${CONTRATO_IMPORT_UPLOAD.maxDataRows}). Divide el archivo en lotes más pequeños.`,
      'filas-excedidas',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_ROWS
    )
  }

  private campoObligatorio(campo: string): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_campo_obligatorio_message',
      { campo },
      `El campo "${campo}" es obligatorio y no puede estar vacío.`,
      'campo-obligatorio-vacio',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA
    )
  }

  private campoInvalido(campo: string, detalle: string): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_campo_invalido_message',
      { campo, detalle },
      `El campo "${campo}" es inválido: ${detalle}`,
      'campo-invalido',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA
    )
  }

  private celdaInvalida(campo: string, detalle: string): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_celda_compuesta_invalida_message',
      { campo, detalle },
      `La celda "${campo}" no respeta el formato esperado (${detalle}).`,
      'celda-compuesta-invalida',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_CELDA_COMPUESTA
    )
  }

  private numeroDuplicadoEnArchivo(numero: string): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_numero_duplicado_archivo_message',
      { numero },
      `Ya existe un contrato con el número "${numero}" en una fila anterior de este mismo archivo.`,
      'numero-contrato-duplicado-en-archivo',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_NUMERO_DUP_ARCHIVO
    )
  }

  private rfcNoEncontrado(rfc: string): ContratoImportRowError {
    return this.buildError(
      'contrato_servicio_especializado_importacion_rfc_no_encontrado_message',
      { rfc },
      `El contratante con RFC ${rfc} no existe en su catálogo.`,
      'contratante-rfc-no-encontrado',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_RFC_NF
    )
  }

  private serviciosNoEncontrados(nombresFaltantes: string[]): ContratoImportRowError {
    const nombres = nombresFaltantes.join(', ')
    return this.buildError(
      'contrato_servicio_especializado_importacion_servicios_no_encontrados_message',
      { nombres },
      `No se encontraron los siguientes servicios registrados en su catálogo: ${nombres}.`,
      'servicio-registrado-no-encontrado',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SERVICIO_REGISTRADO_NOT_FOUND
    )
  }

  private buildError(
    i18nKey: string,
    data: Record<string, unknown> | undefined,
    fallback: string,
    key: string,
    code: string
  ): ContratoImportRowError {
    const motivo = this.translate(i18nKey, data, fallback)
    return new ContratoImportRowError(motivo, key, code)
  }

  private translate(
    key: string,
    data: Record<string, unknown> | undefined,
    fallback: string
  ): string {
    if (!this.i18n) {
      return fallback
    }
    return this.i18n.t(key, data, fallback)
  }

  private mapRowError(rowNumber: number, error: unknown): ContratoImportRowErrorEntry {
    if (error instanceof ContratoImportRowError) {
      return { row: rowNumber, motivo: error.message, key: error.key, code: error.code }
    }

    if (error instanceof ContratoServicioEspecializadoError) {
      const resolved = resolveContratoServicioEspecializadoApiError(error, 400, this.i18n)
      return {
        row: rowNumber,
        motivo: resolved.detail ?? resolved.message,
        key: resolved.key ?? 'error-fila',
        code: resolved.errorCode,
      }
    }

    logger.error(
      { err: error, row: rowNumber },
      'Error inesperado al procesar fila de importación de contratos de servicios especializados'
    )
    return {
      row: rowNumber,
      motivo: this.translate(
        'contrato_servicio_especializado_importacion_fila_error_generico_message',
        undefined,
        'No se pudo procesar la fila por un error inesperado.'
      ),
      key: 'error-inesperado-fila',
      code: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA,
    }
  }

  /** Expuesto para que el controller identifique errores globales (archivo/cabeceras) del catch genérico. */
  static isGlobalImportError(error: unknown): error is ContratoImportRowError {
    return error instanceof ContratoImportRowError
  }

  /** Extrae `{motivo, key, code}` de un error global para la respuesta 400. */
  static toGlobalErrorBody(error: ContratoImportRowError) {
    return { motivo: error.message, key: error.key, code: error.code }
  }
}
