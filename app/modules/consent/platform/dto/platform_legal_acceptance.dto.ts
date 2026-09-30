import type { DateTime } from 'luxon'
import type { PlatformDocumentAcceptanceStatus } from '#modules/consent/platform/platform_consent.constants'
import type { CurrentAcceptanceDocument } from '#modules/consent/platform/platform_consent.repository'

/** Versión vigente expuesta en el contrato §10 (§4 regla 9). */
export interface CurrentDocumentVersionDto {
  version: string
  publishedAt: string | null
}

/** Estado y última aceptación por documento en la fila del tenant (§4 reglas 2 y 4). */
export interface DocumentAcceptanceDto {
  status: PlatformDocumentAcceptanceStatus
  lastAcceptedAt: string | null
}

/** Fila del listado: empresa + aceptación de términos y aviso (§4 regla 9, contrato §10). */
export interface TenantLegalAcceptanceDto {
  businessUnitPublicId: string
  businessUnitName: string
  termsConditions: DocumentAcceptanceDto
  privacyNotice: DocumentAcceptanceDto
}

/** Respuesta congelada de GET /api/platform/legal-acceptances (contrato §10). */
export interface PlatformLegalAcceptancesResponse {
  type: 'success'
  currentVersions: {
    termsConditions: CurrentDocumentVersionDto | null
    privacyNotice: CurrentDocumentVersionDto | null
  }
  data: TenantLegalAcceptanceDto[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

/**
 * Mapea la versión vigente del puerto al DTO (§4 regla 9; fechas ISO 8601 con zona).
 */
export function toCurrentDocumentVersionDto(
  doc: CurrentAcceptanceDocument | null
): CurrentDocumentVersionDto | null {
  if (doc === null) {
    return null
  }
  return {
    version: doc.version,
    publishedAt: doc.publishedAt !== null ? doc.publishedAt.toISO() : null,
  }
}

/**
 * Mapea estado calculado y última aceptación al DTO por documento (§4 reglas 2 y 4).
 */
export function toDocumentAcceptanceDto(
  status: PlatformDocumentAcceptanceStatus,
  lastAcceptedAt: DateTime | null
): DocumentAcceptanceDto {
  return {
    status,
    lastAcceptedAt: lastAcceptedAt !== null ? lastAcceptedAt.toISO() : null,
  }
}
