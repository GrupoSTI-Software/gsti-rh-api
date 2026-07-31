import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import EmpresaContratante from '#models/empresa_contratante'
import RepseRegistration from '#models/repse_registration'
import RepseSpecializedService from '#models/repse_specialized_service'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import Clausula15d from '#models/clausula_15d'
import { blindIndex } from '#utils/blind_index'
import { computeRfcCheckDigit, normalizeRfc } from '../../../app/shared/validators/rfc.validator.js'

/** Cabeceras canónicas de la plantilla (fila 1); deben coincidir con `CONTRATO_IMPORT_FIELDS` del service. */
export const CONTRATO_IMPORT_CANONICAL_HEADERS = [
  'RFC contratante',
  'Número de contrato',
  'Fecha inicio',
  'Fecha fin',
  'Objeto del servicio',
  'Monto total',
  'Moneda',
  'Anexo - Objeto detallado',
  'Anexo - Número de trabajadores',
  'Anexo - Fecha inicio servicio',
  'Anexo - Fecha fin servicio',
  'Anexo - Compromisos documentales',
  'Anexo - Responsabilidad solidaria',
  'Servicios registrados',
] as const

const DEFAULT_OBJETO_SERVICIO =
  'Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.'
const DEFAULT_ANEXO_OBJETO =
  'Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.'
const DEFAULT_COMPROMISOS =
  'cfdi_nomina|Entrega mensual de CFDI de nómina por cada trabajador asignado al servicio|mensual'
const DEFAULT_RESPONSABILIDAD =
  'Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.'

export interface ContratoImportRowInput {
  rfcContratante: string
  numeroContrato: string
  fechaInicio?: string
  fechaFin?: string | null
  objetoServicio?: string
  montoTotal?: number | string | null
  moneda?: string | null
  anexoObjetoDetallado?: string
  anexoNumeroTrabajadores?: number | string
  anexoFechaInicioServicio?: string
  anexoFechaFinServicio?: string | null
  anexoCompromisos?: string
  anexoResponsabilidadSolidaria?: string
  serviciosRegistrados?: string
}

export interface ContratoImportTestFixture {
  businessUnit: BusinessUnit
  repseRegistration: RepseRegistration
  contratante: EmpresaContratante
  servicioA: RepseSpecializedService
  servicioB: RepseSpecializedService
  contratanteRfc: string
  servicioAName: string
  servicioBName: string
}

export function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

let rfcCounter = 0

/** RFC persona moral con dígito verificador SAT válido. */
export function randomValidRfc(): string {
  rfcCounter += 1
  const homoclave = String(rfcCounter % 100).padStart(2, '0')
  const base = `ABC850101${homoclave}`
  return `${base}${computeRfcCheckDigit(base)}`
}

export async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `ContratoImport ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `contrato-import-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `ContratoImport ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

export async function deleteBusinessUnit(businessUnit: BusinessUnit | null): Promise<void> {
  if (!businessUnit) return
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

export async function createRepseRegistration(
  businessUnit: BusinessUnit,
  options: {
    expiresAt?: DateTime
    status?: RepseRegistration['status']
  } = {}
): Promise<RepseRegistration> {
  const registration = new RepseRegistration()
  registration.businessUnitId = businessUnit.businessUnitId
  registration.folio = `CSE-IMPORT-${uniqueStamp()}`
  registration.registeredAt = DateTime.now()
  registration.expiresAt = options.expiresAt ?? DateTime.now().plus({ years: 1 })
  registration.status = options.status ?? 'active'
  await registration.save()
  return registration
}

export async function cleanupRepseRegistration(id: number | null): Promise<void> {
  if (!id) return
  await RepseRegistration.query().where('repse_registration_id', id).delete()
}

/** Cabeceras con variaciones de acentos/espacios que deben emparejarse tras normalizar. */
export const CONTRATO_IMPORT_VARIANT_HEADERS = [
  '  RFC contratante  ',
  'Numero de contrato',
  'Fecha inicio',
  'Fecha fin',
  'Objeto del servicio',
  'Monto total',
  'Moneda',
  'Anexo - Objeto detallado',
  'Anexo - Numero de trabajadores',
  'Anexo - Fecha inicio servicio',
  'Anexo - Fecha fin servicio',
  'Anexo - Compromisos documentales',
  'Anexo - Responsabilidad solidaria',
  'Servicios registrados',
] as const

export async function createContratoImportFixture(
  businessUnit: BusinessUnit,
  options: { repseStatus?: RepseRegistration['status'] } = {}
): Promise<ContratoImportTestFixture> {
  const repseRegistration = await createRepseRegistration(businessUnit, {
    status: options.repseStatus ?? 'active',
  })
  const contratanteRfc = randomValidRfc()
  const servicioAName = `Servicio import A ${uniqueStamp()}`
  const servicioBName = `Servicio import B ${uniqueStamp()}`

  const contratante = new EmpresaContratante()
  contratante.businessUnitId = businessUnit.businessUnitId
  contratante.razonSocial = `Contratante Import ${uniqueStamp()} SA de CV`
  contratante.rfc = normalizeRfc(contratanteRfc)
  contratante.rfcHash = blindIndex(contratante.rfc)
  contratante.domicilioFiscal = 'Av. Reforma 100, CDMX'
  await contratante.save()

  const servicioA = new RepseSpecializedService()
  servicioA.repseRegistrationId = repseRegistration.repseRegistrationId
  servicioA.name = servicioAName
  servicioA.objectDescription = 'Objeto del servicio A para pruebas de importación.'
  servicioA.status = 'active'
  await servicioA.save()

  const servicioB = new RepseSpecializedService()
  servicioB.repseRegistrationId = repseRegistration.repseRegistrationId
  servicioB.name = servicioBName
  servicioB.objectDescription = 'Objeto del servicio B para pruebas de importación.'
  servicioB.status = 'active'
  await servicioB.save()

  return {
    businessUnit,
    repseRegistration,
    contratante,
    servicioA,
    servicioB,
    contratanteRfc: contratante.rfc!,
    servicioAName,
    servicioBName,
  }
}

export async function cleanupContratoImportFixture(
  fixture: ContratoImportTestFixture | null
): Promise<void> {
  if (!fixture) return
  await cleanupContratosByBusinessUnit(fixture.businessUnit.businessUnitId)
  await RepseSpecializedService.query()
    .whereIn('repse_specialized_service_id', [
      fixture.servicioA.repseSpecializedServiceId,
      fixture.servicioB.repseSpecializedServiceId,
    ])
    .delete()
  await EmpresaContratante.query()
    .where('empresa_contratante_id', fixture.contratante.empresaContratanteId)
    .delete()
  await cleanupRepseRegistration(fixture.repseRegistration.repseRegistrationId)
}

export function buildValidContratoImportRow(
  fixture: ContratoImportTestFixture,
  overrides: Partial<ContratoImportRowInput> = {}
): ContratoImportRowInput {
  const stamp = uniqueStamp()
  return {
    rfcContratante: fixture.contratanteRfc,
    numeroContrato: `CSE-IMPORT-${stamp}`,
    fechaInicio: '2026-01-15',
    fechaFin: '2026-12-31',
    objetoServicio: DEFAULT_OBJETO_SERVICIO,
    montoTotal: 450000,
    moneda: 'MXN',
    anexoObjetoDetallado: DEFAULT_ANEXO_OBJETO,
    anexoNumeroTrabajadores: 12,
    anexoFechaInicioServicio: '2026-01-15',
    anexoFechaFinServicio: '2026-12-31',
    anexoCompromisos: DEFAULT_COMPROMISOS,
    anexoResponsabilidadSolidaria: DEFAULT_RESPONSABILIDAD,
    serviciosRegistrados: fixture.servicioAName,
    ...overrides,
  }
}

function rowToArray(row: ContratoImportRowInput): ExcelJS.CellValue[] {
  return [
    row.rfcContratante,
    row.numeroContrato,
    row.fechaInicio ?? '',
    row.fechaFin ?? '',
    row.objetoServicio ?? '',
    row.montoTotal ?? '',
    row.moneda ?? '',
    row.anexoObjetoDetallado ?? '',
    row.anexoNumeroTrabajadores ?? '',
    row.anexoFechaInicioServicio ?? '',
    row.anexoFechaFinServicio ?? '',
    row.anexoCompromisos ?? '',
    row.anexoResponsabilidadSolidaria ?? '',
    row.serviciosRegistrados ?? '',
  ]
}

/** Genera un `.xlsx` en memoria con cabeceras canónicas + filas de datos. */
export async function buildContratoImportExcelBuffer(
  rows: ContratoImportRowInput[],
  options: { headers?: readonly string[] } = {}
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Contratos')
  const headers = options.headers ?? CONTRATO_IMPORT_CANONICAL_HEADERS
  sheet.addRow([...headers])
  for (const row of rows) {
    sheet.addRow(rowToArray(row))
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/** Lee la primera hoja de un buffer xlsx y devuelve la fila 1 como texto. */
export async function readExcelHeaderRow(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  const row = sheet.getRow(1)
  const headers: string[] = []
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim()
  })
  return headers.filter((value) => value.length > 0)
}

export async function createContratoInTenant(params: {
  fixture: ContratoImportTestFixture
  numeroContrato: string
}): Promise<number> {
  const contrato = new ContratoServicioEspecializado()
  contrato.businessUnitId = params.fixture.businessUnit.businessUnitId
  contrato.empresaContratanteId = params.fixture.contratante.empresaContratanteId
  contrato.numeroContrato = params.numeroContrato
  contrato.fechaInicio = DateTime.fromISO('2026-01-01')
  contrato.fechaFin = DateTime.fromISO('2026-12-31')
  contrato.objetoServicio = DEFAULT_OBJETO_SERVICIO
  contrato.montoTotal = 100000
  contrato.moneda = 'MXN'
  contrato.estatus = 'borrador'
  await contrato.save()

  const anexo = new Clausula15d()
  anexo.contratoServicioEspecializadoId = contrato.contratoServicioEspecializadoId
  anexo.folioRepse = params.fixture.repseRegistration.folio
  anexo.objetoDetallado = DEFAULT_ANEXO_OBJETO
  anexo.numeroTrabajadoresAprox = 5
  anexo.fechaInicioServicio = DateTime.fromISO('2026-01-01')
  anexo.fechaFinServicio = DateTime.fromISO('2026-12-31')
  anexo.compromisosDocumentales = [
    { tipo: 'cfdi_nomina', descripcion: 'Entrega mensual de CFDI', periodicidad: 'mensual' },
  ]
  anexo.responsabilidadSolidariaAceptada = true
  anexo.textoResponsabilidadSolidaria = DEFAULT_RESPONSABILIDAD
  await anexo.save()

  await contrato.related('repseSpecializedServices').attach([params.fixture.servicioA.repseSpecializedServiceId])

  return contrato.contratoServicioEspecializadoId
}

export async function cleanupContratosByBusinessUnit(businessUnitId: number): Promise<void> {
  const contratos = await ContratoServicioEspecializado.query()
    .where('business_unit_id', businessUnitId)
    .select('contrato_servicio_especializado_id')

  for (const contrato of contratos) {
    await cleanupContratoById(contrato.contratoServicioEspecializadoId)
  }
}

export async function cleanupContratoById(contratoId: number | null): Promise<void> {
  if (!contratoId) return
  await db
    .from('contrato_servicio_repse')
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
  await Clausula15d.query().where('contrato_servicio_especializado_id', contratoId).delete()
  await ContratoServicioEspecializado.query()
    .where('contrato_servicio_especializado_id', contratoId)
    .delete()
}

export async function countContratosByNumero(
  businessUnitId: number,
  numeroContrato: string
): Promise<number> {
  const row = await ContratoServicioEspecializado.query()
    .whereNull('contrato_servicio_especializado_deleted_at')
    .where('business_unit_id', businessUnitId)
    .where('contrato_servicio_especializado_numero_contrato', numeroContrato)
    .count('* as total')
    .first()
  return Number(row?.$extras.total ?? 0)
}

export async function getContratoEstatusByNumero(
  businessUnitId: number,
  numeroContrato: string
): Promise<string | null> {
  const row = await ContratoServicioEspecializado.query()
    .whereNull('contrato_servicio_especializado_deleted_at')
    .where('business_unit_id', businessUnitId)
    .where('contrato_servicio_especializado_numero_contrato', numeroContrato)
    .first()
  return row?.estatus ?? null
}

/** Permiso `create` del módulo `repse-registrations` (systemPermissionId 157). */
export const REPSE_REGISTRATIONS_CREATE_PERMISSION_ID = 157

export function buildOversizedImportFileBuffer(): Buffer {
  return Buffer.alloc(10 * 1024 * 1024 + 1, 0)
}

export const CONTRATO_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024

/** Firma PNG mínima (8 bytes) para probar rechazo por extensión/tipo. */
export const SAMPLE_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

/** Bytes ZIP mínimos con extensión `.docx` (no `.xlsx`). */
export const SAMPLE_DOCX_BUFFER = Buffer.from('PK\x03\x04 docx-no-es-contrato-import')

/**
 * Fila mínima con celdas no vacías (para inflar tamaño del workbook sin depender de fixture).
 * Los valores de negocio son dummy; sirve para probar límites de archivo/volumen.
 */
export function buildVolumeContratoImportRow(index: number): ContratoImportRowInput {
  const suffix = String(index).padStart(6, '0')
  const uniqueNoise = `${suffix}-${Date.now()}-${Math.random()}`
  const objetoPadding =
    `${'Prestación de servicios especializados de limpieza industrial. '.repeat(20)}${uniqueNoise}`
  const anexoPadding =
    `${'Limpieza profunda de áreas productivas y zonas comunes. '.repeat(25)}${uniqueNoise}`

  return {
    rfcContratante: `AAA850101${suffix.slice(0, 2)}`,
    numeroContrato: `CSE-VOLUME-${suffix}`,
    fechaInicio: '2026-01-15',
    fechaFin: '2026-12-31',
    objetoServicio: objetoPadding.slice(0, 2000),
    montoTotal: 1000 + index,
    moneda: 'MXN',
    anexoObjetoDetallado: anexoPadding.slice(0, 3000),
    anexoNumeroTrabajadores: 1,
    anexoFechaInicioServicio: '2026-01-15',
    anexoFechaFinServicio: '2026-12-31',
    anexoCompromisos: DEFAULT_COMPROMISOS,
    anexoResponsabilidadSolidaria: DEFAULT_RESPONSABILIDAD,
    serviciosRegistrados: `Servicio volumen ${suffix}`,
  }
}

/** Genera un `.xlsx` válido cuyo tamaño en bytes es al menos `minBytes`. */
export async function buildContratoImportExcelBufferMinSize(minBytes: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Contratos')
  sheet.addRow([...CONTRATO_IMPORT_CANONICAL_HEADERS])

  let index = 0
  while (index < 25_000) {
    for (let batch = 0; batch < 500; batch += 1) {
      sheet.addRow(rowToArray(buildVolumeContratoImportRow(index)))
      index += 1
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    if (buffer.length >= minBytes) {
      return buffer
    }
  }

  throw new Error(`No se pudo generar un xlsx de ${minBytes} bytes.`)
}

/**
 * Workbook `.xlsx` válido (cabeceras + filas) cuyo tamaño de subida supera 10 MB.
 * Si la compresión ZIP impide llegar al tope solo con filas, se completa el buffer
 * para ejercitar el rechazo por tamaño del multipart (antes de parsear filas).
 */
export async function buildValidOversizedContratoImportExcelBuffer(): Promise<Buffer> {
  let buffer: Buffer
  try {
    buffer = await buildContratoImportExcelBufferMinSize(CONTRATO_IMPORT_MAX_FILE_BYTES + 1)
  } catch {
    buffer = await buildContratoImportExcelBuffer(
      Array.from({ length: 5000 }, (_, index) => buildVolumeContratoImportRow(index))
    )
  }

  if (buffer.length <= CONTRATO_IMPORT_MAX_FILE_BYTES) {
    buffer = Buffer.concat([
      buffer,
      Buffer.alloc(CONTRATO_IMPORT_MAX_FILE_BYTES - buffer.length + 1, 0),
    ])
  }

  return buffer
}

/** Genera N filas dummy para pruebas de volumen (sin fixture). */
export function buildVolumeContratoImportRows(count: number): ContratoImportRowInput[] {
  return Array.from({ length: count }, (_, index) => buildVolumeContratoImportRow(index))
}
