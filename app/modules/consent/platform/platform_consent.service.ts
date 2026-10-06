import type { DateTime } from 'luxon'
import PlatformTenantService from '#services/platform_tenant_service'
import PlatformConsentError from '#exceptions/platform_consent_error'
import EvidenceService from '#modules/consent/evidence/evidence.service'
import {
  PLATFORM_ACCEPTANCES_DEFAULT_LIMIT,
  PLATFORM_ACCEPTANCE_DOCUMENT_TYPES,
  type PlatformAcceptanceStatusFilter,
  type PlatformDocumentAcceptanceStatus,
} from '#modules/consent/platform/platform_consent.constants'
import {
  toCurrentDocumentVersionDto,
  toDocumentAcceptanceDto,
  toTenantLegalAcceptanceRow,
  type PlatformLegalAcceptancesResponse,
  type PlatformTenantLegalAcceptancesResponseDto,
} from '#modules/consent/platform/dto/platform_legal_acceptance.dto'
import type {
  CurrentAcceptanceDocuments,
  DocumentAcceptanceFacts,
  PlatformConsentRepository,
} from '#modules/consent/platform/platform_consent.repository'
import PlatformConsentRepositoryMysql from '#modules/consent/platform/platform_consent.repository.mysql'

/**
 * Resuelve el estado de aceptación de un documento a partir de hechos agregados
 * (§4 reglas 2 y 4: orden idéntico al predicado SQL del listado).
 */
export function resolveDocumentStatus(
  hasCurrent: boolean,
  lastAcceptedAt: DateTime | null,
  acceptedCurrent: boolean
): PlatformDocumentAcceptanceStatus {
  if (!hasCurrent) {
    return 'sin-version-publicada'
  }
  if (acceptedCurrent) {
    return 'al-dia'
  }
  if (lastAcceptedAt !== null) {
    return 'pendiente'
  }
  return 'nunca'
}

/** Filtros ya validados del listado de aceptaciones (§4 reglas 5, 10 y 12). */
export interface ListLegalAcceptancesFilters {
  search?: string
  status?: PlatformAcceptanceStatusFilter
  page?: number
  limit?: number
}

/**
 * Servicio de aceptaciones legales de plataforma por empresa (§4).
 *
 * Orquesta el universo de empresas (sin borradas, §4 regla 5), los documentos vigentes
 * (regla 9) y los hechos de aceptación del adaptador; aquí solo se calculan estados y
 * se arma el DTO. La regla de quién cuenta como aceptante (DA-1, regla 1) vive en el
 * adaptador, no en el servicio.
 */
export default class PlatformConsentService {
  constructor(
    private readonly tenantService: PlatformTenantService = new PlatformTenantService(),
    private readonly repository: PlatformConsentRepository = new PlatformConsentRepositoryMysql(),
    private readonly evidenceService: EvidenceService = new EvidenceService()
  ) {}

  /**
   * Lista las empresas del universo con el estado de aceptación de términos y aviso
   * (§4 reglas 2, 4, 9, 10 y 12).
   *
   * Universo vacío: responde sin consultar aceptaciones (no se toca `user_consents`).
   * Página fuera de rango: `data: []` con el `meta` real. `lastPage` mínimo 1.
   * Regla 4: sin versión vigente el documento sale `sin-version-publicada` con
   * `lastAcceptedAt: null` (lo garantiza `toDocumentAcceptanceDto`).
   */
  async listLegalAcceptances(
    filters: ListLegalAcceptancesFilters
  ): Promise<PlatformLegalAcceptancesResponse> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? PLATFORM_ACCEPTANCES_DEFAULT_LIMIT

    const current = await this.repository.findCurrentDocuments()
    const currentVersions = {
      termsConditions: toCurrentDocumentVersionDto(current.termsConditions),
      privacyNotice: toCurrentDocumentVersionDto(current.privacyNotice),
    }

    const universe = await this.tenantService.fetchAllCompanyIds(filters.search)
    if (universe.length === 0) {
      return {
        type: 'success',
        currentVersions,
        data: [],
        meta: { total: 0, page, limit, lastPage: 1 },
      }
    }

    const { rows, total } = await this.repository.listTenantAcceptances({
      businessUnitIds: universe.map((company) => company.buId),
      current,
      status: filters.status,
      page,
      limit,
    })

    return {
      type: 'success',
      currentVersions,
      data: rows.map((row) => ({
        businessUnitPublicId: row.businessUnitPublicId,
        businessUnitName: row.businessUnitName,
        termsConditions: this.toDocumentDto(current, 'termsConditions', row.termsConditions),
        privacyNotice: this.toDocumentDto(current, 'privacyNotice', row.privacyNotice),
      })),
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    }
  }

  /**
   * Historial de aceptaciones legales de una empresa por su `businessUnitPublicId`
   * (§14, contrato §10). Una sola barrera por capa: aquí viven el 404
   * (`empresa-no-encontrada`) y la aserción de id interno positivo, antes de tocar
   * la evidencia (§6, SEC-D-01).
   *
   * La evidencia se acota a los tipos de plataforma (términos y aviso) y excluye a
   * las cuentas de plataforma (`excludePlatformAccounts`). `revealAllowed` se fija en
   * `false` (SEC-D-04): el historial nunca revela `ip`/`userAgent` en claro, y nada del
   * caller lo cambia.
   */
  async getTenantHistory(
    publicId: string,
    page: number,
    perPage: number
  ): Promise<PlatformTenantLegalAcceptancesResponseDto> {
    const tenant = await this.repository.findBusinessUnitByPublicId(publicId)
    if (tenant === null) {
      throw new PlatformConsentError('empresa-no-encontrada')
    }
    this.assertPositiveBusinessUnitId(tenant.businessUnitId)

    const evidencePage = await this.evidenceService.getEvidence(
      {
        businessUnitId: tenant.businessUnitId,
        types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES],
        excludePlatformAccounts: true,
      },
      { page, perPage },
      false
    )
    const owners = new Set(await this.repository.findOwnerUserIds(tenant.businessUnitId))

    return {
      type: 'success',
      tenant: {
        businessUnitPublicId: tenant.businessUnitPublicId,
        businessUnitName: tenant.businessUnitName,
      },
      data: evidencePage.data.map((row) => toTenantLegalAcceptanceRow(row, owners)),
      meta: evidencePage.meta,
    }
  }

  /** Aserción previa a cualquier consulta de evidencia (SEC-D-01): el id interno debe ser positivo. */
  private assertPositiveBusinessUnitId(businessUnitId: number): void {
    if (!Number.isSafeInteger(businessUnitId) || businessUnitId <= 0) {
      throw new Error('Identificador interno de empresa inválido')
    }
  }

  private toDocumentDto(
    current: CurrentAcceptanceDocuments,
    document: keyof CurrentAcceptanceDocuments,
    facts: DocumentAcceptanceFacts
  ) {
    const status = resolveDocumentStatus(
      current[document] !== null,
      facts.lastAcceptedAt,
      facts.acceptedCurrentAt !== null
    )
    return toDocumentAcceptanceDto(status, facts.lastAcceptedAt)
  }
}
