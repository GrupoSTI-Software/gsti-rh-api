import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import PlatformTenantService from '#services/platform_tenant_service'
import PiiAccessLogService from '#services/pii_access_log_service'
import PlatformConsentError from '#exceptions/platform_consent_error'
import EvidenceService from '#modules/consent/evidence/evidence.service'
import type { PiiAccessInputInterface } from '../../../interfaces/pii_access_input_interface.js'
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
  type PlatformRevealAccessor,
  type PlatformRevealedEvidenceDto,
  type PlatformTenantLegalAcceptancesResponseDto,
} from '#modules/consent/platform/dto/platform_legal_acceptance.dto'
import type {
  CurrentAcceptanceDocuments,
  DocumentAcceptanceFacts,
  PlatformConsentRepository,
} from '#modules/consent/platform/platform_consent.repository'
import PlatformConsentRepositoryMysql from '#modules/consent/platform/platform_consent.repository.mysql'

/** Módulo de origen saneado que la bitácora anota en cada revelado del expediente. */
const PLATFORM_LEGAL_ACCEPTANCES_ORIGIN_MODULE = 'platform-legal-acceptances'

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
    private readonly evidenceService: EvidenceService = new EvidenceService(),
    private readonly piiAccessLogService: PiiAccessLogService = new PiiAccessLogService()
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

  /**
   * Revela la IP y el agente de usuario en claro de UNA aceptación de la empresa del path,
   * registrando antes cada columna con valor en la bitácora de acceso a datos personales
   * (§10, §14).
   *
   * Orden no negociable: empresa → aserciones `> 0` → lookup enmascarado → (si no hay
   * columnas con valor: return sin bitácora) → transacción `record`×N → lectura en claro →
   * return. Nada de IP ni UA en claro antes de la lectura; el registro y la lectura viven
   * en la misma transacción, así que si el registro falla no hay dato ni filas parciales.
   */
  async revealEvidence(
    publicId: string,
    userConsentId: number,
    accessor: PlatformRevealAccessor
  ): Promise<PlatformRevealedEvidenceDto> {
    const tenant = await this.repository.findBusinessUnitByPublicId(publicId)
    if (tenant === null) {
      throw new PlatformConsentError('empresa-no-encontrada')
    }
    this.assertPositiveBusinessUnitId(tenant.businessUnitId)

    // El filtro `.if` del repositorio no acota con 0: se corta aquí. Error interno (nunca
    // llega por HTTP: el validador lo rechaza antes).
    if (!Number.isSafeInteger(userConsentId) || userConsentId <= 0) {
      throw new Error('Identificador de aceptación inválido')
    }

    const filters = {
      businessUnitId: tenant.businessUnitId,
      userConsentId,
      types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES],
      excludePlatformAccounts: true,
    }
    const masked = await this.evidenceService.getEvidence(filters, { page: 1, perPage: 1 }, false)
    const row = masked.data[0]
    if (row?.userConsentId !== userConsentId) {
      throw new PlatformConsentError('aceptacion-no-encontrada')
    }

    // Una fila por columna CON valor: `null` y `''` se tratan como sin dato (`maskSensitiveValue`
    // conserva la cadena vacía) y no se registran ni se revelan como dato.
    const columns: Array<'userConsentIp' | 'userConsentUserAgent'> = []
    if (row.ip !== null && row.ip !== '') {
      columns.push('userConsentIp')
    }
    if (row.userAgent !== null && row.userAgent !== '') {
      columns.push('userConsentUserAgent')
    }
    if (columns.length === 0) {
      return { userConsentId, ip: row.ip, userAgent: row.userAgent }
    }

    try {
      return await db.transaction(async (trx) => {
        for (const column of columns) {
          const input: PiiAccessInputInterface = {
            businessUnitId: tenant.businessUnitId,
            accessorUserId: accessor.accessorUserId,
            model: 'UserConsent',
            modelColumn: column,
            recordId: userConsentId,
            accessorIp: accessor.accessorIp,
            accessorUserAgent: accessor.accessorUserAgent,
            requestId: null,
            subjectEmployeeId: row.employeeId,
            originModule: PLATFORM_LEGAL_ACCEPTANCES_ORIGIN_MODULE,
          }
          await this.piiAccessLogService.record(input, trx)
        }

        const clear = await this.evidenceService.getEvidence(filters, { page: 1, perPage: 1 }, true)
        const clearRow = clear.data[0]
        if (clearRow?.userConsentId !== userConsentId) {
          // Carrera entre el registro y la lectura: revierte el callback (rollback).
          throw new PlatformConsentError('aceptacion-no-encontrada')
        }
        return { userConsentId, ip: clearRow.ip, userAgent: clearRow.userAgent }
      })
    } catch (error) {
      if (error instanceof PlatformConsentError && error.key === 'aceptacion-no-encontrada') {
        throw error
      }
      // Solo empresa, aceptación y nombre del error — NUNCA IP ni UA.
      logger.error(
        {
          businessUnitId: tenant.businessUnitId,
          userConsentId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'No fue posible revelar la evidencia de la aceptación'
      )
      const revealError = new PlatformConsentError('no-fue-posible-revelar-la-evidencia')
      Object.assign(revealError, { cause: error })
      throw revealError
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
