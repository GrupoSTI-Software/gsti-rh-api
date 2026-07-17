import type UserConsent from '#models/user_consent'
import type { LegalDocumentType } from '#models/legal_document'
import type { UserConsentChannel } from '#models/user_consent'

/** Filtros combinables de la consulta de evidencia (regla 3, USRH1783368377327). */
export interface EvidenceFilters {
  /** Tipo de documento (`legal_documents.legal_document_type`). Combinable con `version`. */
  type?: LegalDocumentType
  /** Versión exacta del documento (`legal_documents.legal_document_version`). */
  version?: string
  /** Documento concreto por id — alternativa directa a `type`/`version`. */
  legalDocumentId?: number
  /** Historial de un usuario puntual. NO encuentra asientos físicos de empleados sin usuario (limitación documentada, USRH1784146205513 §11.2). */
  userId?: number
  /** Acota a una sola empresa (tenant); ausente = global (todas las empresas). */
  businessUnitId?: number
  /** `'digital'` o `'physical'` — ausente = ambos canales (USRH1784146205513). */
  channel?: UserConsentChannel
}

export interface EvidencePagination {
  page: number
  perPage: number
}

export interface EvidencePageMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface EvidencePageResult {
  rows: UserConsent[]
  meta: EvidencePageMeta
}

/**
 * Puerto de acceso a datos de solo lectura de la evidencia de aceptaciones.
 *
 * Propio del sub-módulo `consent/evidence`: NO extiende `AcceptanceRepository`
 * (`consent/acceptance`) para no mezclar la responsabilidad de registrar
 * aceptaciones (escritura, cimiento USRH1783101935670) con la de consultarlas
 * en un reporte paginado/exportable (lectura, esta historia).
 */
export interface EvidenceRepository {
  /** Página de evidencia según `filters`, con `user`/`legalDocument` precargados. */
  findEvidence(filters: EvidenceFilters, pagination: EvidencePagination): Promise<EvidencePageResult>

  /** Todas las filas que cumplen `filters`, sin paginar — para el export a Excel. */
  findAllForExport(filters: EvidenceFilters): Promise<UserConsent[]>
}
