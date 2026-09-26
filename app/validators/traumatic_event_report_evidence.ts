import vine from '@vinejs/vine'

/**
 * Conjunto cerrado de categorías de evidencia documental del reporte traumático.
 * Debe mantenerse alineado con `TraumaticEventReportEvidenceCategory` del modelo.
 */
export const TRAUMATIC_EVENT_REPORT_EVIDENCE_CATEGORIES = [
  'written_statement',
  'incident_record',
  'other',
] as const

/**
 * Solo se valida la categoría con VineJS. El archivo (tipo/tamaño) se valida
 * dentro del service para poder devolver `code` estable tipado con `key`
 * consistente al cliente (mismo patrón que lactancia y certificaciones).
 */
export const traumaticEventReportEvidenceUploadValidator = vine.compile(
  vine.object({
    traumaticEventReportEvidenceCategory: vine
      .enum([...TRAUMATIC_EVENT_REPORT_EVIDENCE_CATEGORIES])
      .optional(),
  })
)
