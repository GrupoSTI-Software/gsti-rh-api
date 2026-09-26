/** Catálogo cerrado de tipos de documento del expediente REPSE (MVP). */
export const REPSE_EXPEDIENTE_DOCUMENTO_TIPOS = [
  'contrato',
  'anexo-15d',
  'cfdi',
  'comprobante-imss',
  'comprobante-infonavit',
  'declaracion-isr',
  'declaracion-iva',
  'retencion-isr',
] as const

export type RepseExpedienteDocumentoTipo = (typeof REPSE_EXPEDIENTE_DOCUMENTO_TIPOS)[number]

/** Texto legible del catálogo cerrado para mensajes de validación. */
export function formatRepseExpedienteTiposForMessage(
  tipos: readonly RepseExpedienteDocumentoTipo[] = REPSE_EXPEDIENTE_DOCUMENTO_TIPOS
): string {
  return tipos.map((tipo) => `'${tipo}'`).join(', ')
}

/** Acciones registradas en la bitácora de accesos al expediente. */
export const REPSE_EXPEDIENTE_ACCESO_ACCIONES = ['consulta', 'descarga', 'eliminacion'] as const

export type RepseExpedienteAccion = (typeof REPSE_EXPEDIENTE_ACCESO_ACCIONES)[number]

export const MAX_EXPEDIENTE_FILE_BYTES = 10 * 1024 * 1024

export const EXPEDIENTE_ALLOWED_EXTENSIONS = ['pdf'] as const

export const EXPEDIENTE_ALLOWED_MIME_TYPES = ['application/pdf'] as const

export const EXPEDIENTE_S3_FOLDER = 'compliance-repse/proveedor-expediente'

/** Años de retención normativa del expediente documental. */
export const EXPEDIENTE_RETENTION_YEARS = 5

/** Roles que pueden borrar documentos dentro del periodo de retención. */
export const EXPEDIENTE_ELEVATED_ROLE_SLUGS = [
  'root',
  'super-administrador',
  'owner',
] as const
