import type { DateTime } from 'luxon'
import type {
  PlatformAcceptanceDocumentType,
  PlatformDocumentAcceptanceStatus,
} from '#modules/consent/platform/platform_consent.constants'
import type { CurrentAcceptanceDocument } from '#modules/consent/platform/platform_consent.repository'
import type { EvidencePageMetaDto, EvidenceRowDto } from '#modules/consent/evidence/dto/evidence.dto'
import type { UserConsentChannel } from '#models/user_consent'

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
 *
 * Regla 4 (único punto donde se codifica): si el estado es `sin-version-publicada`,
 * `lastAcceptedAt` se responde `null` aunque el adaptador traiga el máximo real de
 * aceptaciones, porque el contrato §10 exige `null` junto a ese estado. La firma no cambia.
 */
export function toDocumentAcceptanceDto(
  status: PlatformDocumentAcceptanceStatus,
  lastAcceptedAt: DateTime | null
): DocumentAcceptanceDto {
  if (status === 'sin-version-publicada') {
    return { status, lastAcceptedAt: null }
  }
  return {
    status,
    lastAcceptedAt: lastAcceptedAt !== null ? lastAcceptedAt.toISO() : null,
  }
}

/**
 * Fila del historial de aceptaciones por tenant, contrato congelado de §10 (9 llaves).
 * Es la proyección por lista blanca de una `EvidenceRowDto`: NO expone correo, `userId`,
 * `employeeId`, `legalDocumentId`, empresas ajenas ni los campos del canal físico.
 */
export interface PlatformTenantLegalAcceptanceRowDto {
  userConsentId: number
  userName: string
  isOwner: boolean
  documentType: PlatformAcceptanceDocumentType
  version: string
  acceptedAt: string | null
  channel: UserConsentChannel
  ip: string | null
  userAgent: string | null
}

/** Respuesta de `GET` del historial de aceptaciones por tenant (§10, historia D2 la extiende). */
export interface PlatformTenantLegalAcceptancesResponseDto {
  type: 'success'
  tenant: {
    businessUnitPublicId: string
    businessUnitName: string
  }
  data: PlatformTenantLegalAcceptanceRowDto[]
  meta: EvidencePageMetaDto
}

/**
 * Accesor que solicita el revelado de evidencia de una aceptación (§14): el actor de
 * plataforma y los datos de red que se anotan en la bitácora, NUNCA en la respuesta.
 */
export interface PlatformRevealAccessor {
  accessorUserId: number
  accessorIp: string
  accessorUserAgent: string | null
}

/**
 * Resultado del revelado (contrato §10, tres llaves): la aceptación y su IP/agente de
 * usuario en claro, o `null` cuando el asiento no capturó el dato.
 */
export interface PlatformRevealedEvidenceDto {
  userConsentId: number
  ip: string | null
  userAgent: string | null
}

/**
 * Proyecta una fila de evidencia al contrato del historial por lista blanca (§14).
 *
 * `isOwner` es `true` solo si la fila tiene usuario y ese id pertenece al conjunto de
 * owners ya resuelto (`ownerUserIds`); un asiento físico sin usuario (`userId === null`)
 * nunca es owner. `documentType` se estrecha a `PlatformAcceptanceDocumentType` porque
 * la consulta de evidencia ya se filtró a esos tipos (términos y aviso).
 */
export function toTenantLegalAcceptanceRow(
  row: EvidenceRowDto,
  ownerUserIds: ReadonlySet<number>
): PlatformTenantLegalAcceptanceRowDto {
  return {
    userConsentId: row.userConsentId,
    userName: row.userName,
    isOwner: row.userId !== null && ownerUserIds.has(row.userId),
    documentType: row.documentType as PlatformAcceptanceDocumentType,
    version: row.version,
    acceptedAt: row.acceptedAt,
    channel: row.channel,
    ip: row.ip,
    userAgent: row.userAgent,
  }
}
