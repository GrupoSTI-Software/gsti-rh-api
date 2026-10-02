import type { DateTime } from 'luxon'
import type {
  PlatformAcceptanceDocumentType,
  PlatformAcceptanceStatusFilter,
} from '#modules/consent/platform/platform_consent.constants'

/** Versión vigente publicada de un documento legal incluido en el listado (§4 regla 9). */
export interface CurrentAcceptanceDocument {
  legalDocumentId: number
  type: PlatformAcceptanceDocumentType
  version: string
  publishedAt: DateTime | null
}

/** Par vigente términos + aviso resuelto en una sola consulta (§4 regla 9). */
export interface CurrentAcceptanceDocuments {
  termsConditions: CurrentAcceptanceDocument | null
  privacyNotice: CurrentAcceptanceDocument | null
}

/**
 * Hechos de aceptación de un documento para una empresa, antes de calcular `status`
 * (§4 reglas 1-2: solo owners; última aceptación vs versión vigente).
 */
export interface DocumentAcceptanceFacts {
  /** Última aceptación de un owner, cualquier versión. */
  lastAcceptedAt: DateTime | null
  /** Alguna aceptación de la versión vigente por un owner. */
  acceptedCurrentAt: DateTime | null
}

/** Fila de listado por tenant con hechos por documento (§4 reglas 2 y 9). */
export interface TenantAcceptanceRow {
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
  termsConditions: DocumentAcceptanceFacts
  privacyNotice: DocumentAcceptanceFacts
}

/** Entrada paginada del listado de aceptaciones por empresa (§4 reglas 10 y 12). */
export interface ListTenantAcceptancesInput {
  businessUnitIds: number[]
  current: CurrentAcceptanceDocuments
  status?: PlatformAcceptanceStatusFilter
  page: number
  limit: number
}

/** Puerto de datos para aceptaciones legales de plataforma por tenant (§4). */
export interface PlatformConsentRepository {
  /** Documentos vigentes de términos y aviso (§4 regla 9). */
  findCurrentDocuments(): Promise<CurrentAcceptanceDocuments>

  /**
   * Empresas del universo con hechos de aceptación y total para paginación
   * (§4 reglas 1-2, 5-8, 10, 12).
   */
  listTenantAcceptances(
    input: ListTenantAcceptancesInput
  ): Promise<{ rows: TenantAcceptanceRow[]; total: number }>
}
