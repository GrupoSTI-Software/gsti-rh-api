import type { LegalDocumentType } from '#models/legal_document'
import type { UserConsentChannel } from '#models/user_consent'

/**
 * Fila de evidencia de aceptación (USRH1783368377327; extendida por
 * USRH1784146205513 con el canal físico).
 *
 * `ip`/`userAgent` llegan enmascarados por default (`maskSensitiveValue`, categoría
 * `contacto`) y solo en claro si el caller tiene el permiso dedicado de revelado
 * (`consent-evidence:reveal`) Y pidió `reveal=true`. `businessUnitPublicIds`/
 * `businessUnitNames` son arreglos porque un usuario puede pertenecer a varias
 * empresas (pivot `business_unit_users`); listar un único id sería ambiguo.
 *
 * Se expone `businessUnitPublicId` (UUID), NUNCA el id numérico interno
 * (`business_unit.ts`: `businessUnitId` es `serializeAs: null` — invariante del
 * modelo, "nunca se expone en respuestas de la API"). El mismo id público es el
 * que el filtro `businessUnitPublicId` de este endpoint acepta de vuelta.
 *
 * `userId`/`employeeId` son `number | null`: un asiento físico puede no tener usuario
 * (empleado de kiosco); en ese caso el nombre y la empresa se resuelven desde
 * `employee.person`/`employee.businessUnit` en vez de `user.person`/`user.businessUnits`
 * (H6 — un asiento sin usuario no debe romper el listado ni el export). NUNCA se
 * pre-firma la URL del adjunto aquí (costo por fila + expiración): solo `hasAttachment`,
 * la descarga se pide bajo demanda a `evidence-download-url`/`evidence/:id/download-url`.
 */
export interface EvidenceRowDto {
  /** Id de `user_consents` — clave estable de fila (el filtro por `userId` no la cubre en físico). */
  userConsentId: number
  userId: number | null
  userName: string
  businessUnitPublicIds: string[]
  businessUnitNames: string[]
  /** Id interno de `legal_documents` — permite re-filtrar por este documento exacto (`?legalDocumentId=`). */
  legalDocumentId: number
  documentType: LegalDocumentType
  version: string
  acceptedAt: string | null
  ip: string | null
  userAgent: string | null
  /** `'digital'` (app/web) o `'physical'` (asentado por RH desde el backoffice). */
  channel: UserConsentChannel
  /** Ancla del canal físico; `null` en digital. */
  employeeId: number | null
  /** Quién asentó el consentimiento físico (RH); `null` en digital. */
  registeredByName: string | null
  /** Fecha de firma en papel; `null` en digital. */
  signedAt: string | null
  /** `true` si el asiento tiene escaneo adjunto (solo físico). */
  hasAttachment: boolean
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
