import type { LegalDocumentType } from '#models/legal_document'

/**
 * Fila de evidencia de aceptación (USRH1783368377327).
 *
 * `ip`/`userAgent` llegan enmascarados por default (`maskSensitiveValue`, categoría
 * `contacto`) y solo en claro si el caller tiene el permiso dedicado de revelado
 * (`consent-evidence:reveal`) Y pidió `reveal=true`. `businessUnitIds`/`businessUnitNames`
 * son arreglos porque un usuario puede pertenecer a varias empresas (pivot
 * `business_unit_users`); listar un único id sería ambiguo.
 */
export interface EvidenceRowDto {
  userId: number
  userName: string
  businessUnitIds: number[]
  businessUnitNames: string[]
  /** Id interno de `legal_documents` — permite re-filtrar por este documento exacto (`?legalDocumentId=`). */
  legalDocumentId: number
  documentType: LegalDocumentType
  version: string
  acceptedAt: string | null
  ip: string | null
  userAgent: string | null
}

export interface EvidencePageMetaDto {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

/** Respuesta de `GET /api/consent/evidence`. */
export interface EvidencePageDto {
  data: EvidenceRowDto[]
  meta: EvidencePageMetaDto
}
