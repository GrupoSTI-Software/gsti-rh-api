import Alliance from '#models/alliance'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import type {
  AllianceListItem,
  AllianceView,
  CreateAllianceInput,
  ListAlliancesFilters,
  ListAlliancesResult,
  UpdateAllianceInput,
} from '../interfaces/alliance_interface.js'

/**
 * Rechaza un porcentaje de comisión fuera de 0..100 o con más de dos
 * decimales. Exportable: la HU 06a la reutiliza desde otra entrada.
 */
export function assertCommissionPercent(value: number): void {
  const catalog = ALLIANCE_ERRORS.COMMISSION_OUT_OF_RANGE
  if (!Number.isFinite(value) || value < 0 || value > 100 || hasMoreThanTwoDecimals(value)) {
    throw new AllianceServiceError(
      catalog.detail,
      catalog.code,
      catalog.status,
      catalog.key,
      catalog.detail
    )
  }
}

/**
 * `null`/`undefined` es plazo indeterminado. Cero y negativos se rechazan.
 * Exportable: la HU 06a la reutiliza desde otra entrada.
 */
export function assertTermPeriods(value: number | null | undefined): void {
  if (value === null || value === undefined) {
    return
  }

  if (!Number.isInteger(value) || value < 1) {
    const catalog = ALLIANCE_ERRORS.TERM_PERIODS_INVALID
    throw new AllianceServiceError(
      catalog.detail,
      catalog.code,
      catalog.status,
      catalog.key,
      catalog.detail
    )
  }
}

function hasMoreThanTwoDecimals(value: number): boolean {
  const scaled = value * 100
  return Math.abs(scaled - Math.round(scaled)) > 1e-6
}

function toIso(value: { toISO: () => string | null } | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.toISO()
}

export function toAllianceListItem(alliance: Alliance): AllianceListItem {
  return {
    allianceId: alliance.allianceId,
    allianceName: alliance.allianceName,
    allianceContactName: alliance.allianceContactName,
    allianceContactEmail: alliance.allianceContactEmail,
    allianceDefaultCommissionPercent: Number(alliance.allianceDefaultCommissionPercent),
    allianceDefaultTermPeriods: alliance.allianceDefaultTermPeriods,
    allianceActive: alliance.allianceActive === 1 ? 1 : 0,
    createdAt: toIso(alliance.createdAt) ?? '',
  }
}

export function toAllianceView(alliance: Alliance): AllianceView {
  return {
    ...toAllianceListItem(alliance),
    allianceContactPhone: alliance.allianceContactPhone,
    updatedAt: toIso(alliance.updatedAt),
  }
}

/**
 * Lógica de negocio del registro de alianzas comerciales de la plataforma
 * (USRH1788505941892).
 *
 * Invariantes: toda alianza nace activa; el nombre puede repetirse; el
 * porcentaje y el plazo son valores por omisión (esta HU no los aplica);
 * ningún método escribe `alliance_deleted_at`.
 */
export default class AllianceService {
  /**
   * Listado paginado con filtros. Sin criterios, se comporta como el
   * catálogo completo (sin retirados), orden `alliance_id asc`.
   */
  async listAlliances(filters: ListAlliancesFilters = {}): Promise<ListAlliancesResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)

    const query = Alliance.query().whereNull('alliance_deleted_at').orderBy('alliance_id', 'asc')

    if (filters.search) {
      const term = `%${filters.search.toUpperCase()}%`
      query.where((builder) => {
        builder
          .whereRaw('UPPER(alliance_name) LIKE ?', [term])
          .orWhereRaw('UPPER(alliance_contact_name) LIKE ?', [term])
      })
    }

    if (filters.active !== undefined) {
      query.where('alliance_active', filters.active)
    }

    const paginated = await query.paginate(page, limit)
    const json = paginated.toJSON()

    return {
      data: (json.data as Alliance[]).map(toAllianceListItem),
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  /** 404 tipado si no existe o está retirada con soft delete. */
  async getAlliance(allianceId: number): Promise<Alliance> {
    const alliance = await Alliance.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .first()

    if (!alliance) {
      const catalog = ALLIANCE_ERRORS.NOT_FOUND
      throw new AllianceServiceError(
        catalog.detail,
        catalog.code,
        catalog.status,
        catalog.key,
        catalog.detail
      )
    }

    return alliance
  }

  async createAlliance(input: CreateAllianceInput): Promise<Alliance> {
    assertCommissionPercent(input.allianceDefaultCommissionPercent)
    assertTermPeriods(input.allianceDefaultTermPeriods)

    return Alliance.create({
      allianceName: input.allianceName,
      allianceContactName: input.allianceContactName ?? null,
      allianceContactEmail: input.allianceContactEmail ?? null,
      allianceContactPhone: input.allianceContactPhone ?? null,
      allianceDefaultCommissionPercent: input.allianceDefaultCommissionPercent,
      allianceDefaultTermPeriods: input.allianceDefaultTermPeriods ?? null,
      allianceActive: 1,
    })
  }

  /**
   * Corrige datos de la alianza. `allianceActive` no se acepta (viven
   * activate/deactivate). Las aserciones se re-corren con el estado
   * resultante para no dejar una combinación inconsistente cuando el
   * cliente solo manda un campo.
   */
  async updateAlliance(allianceId: number, input: UpdateAllianceInput): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    const resultingCommission =
      input.allianceDefaultCommissionPercent ?? alliance.allianceDefaultCommissionPercent
    assertCommissionPercent(Number(resultingCommission))

    const resultingTerm =
      input.allianceDefaultTermPeriods !== undefined
        ? input.allianceDefaultTermPeriods
        : alliance.allianceDefaultTermPeriods
    assertTermPeriods(resultingTerm)

    if (input.allianceName !== undefined) {
      alliance.allianceName = input.allianceName
    }
    if (input.allianceContactName !== undefined) {
      alliance.allianceContactName = input.allianceContactName
    }
    if (input.allianceContactEmail !== undefined) {
      alliance.allianceContactEmail = input.allianceContactEmail
    }
    if (input.allianceContactPhone !== undefined) {
      alliance.allianceContactPhone = input.allianceContactPhone
    }
    if (input.allianceDefaultCommissionPercent !== undefined) {
      alliance.allianceDefaultCommissionPercent = input.allianceDefaultCommissionPercent
    }
    if (input.allianceDefaultTermPeriods !== undefined) {
      alliance.allianceDefaultTermPeriods = input.allianceDefaultTermPeriods
    }

    await alliance.save()
    return alliance
  }

  async activateAlliance(allianceId: number): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    if (alliance.allianceActive === 1) {
      const catalog = ALLIANCE_ERRORS.ALREADY_ACTIVE
      throw new AllianceServiceError(
        catalog.detail,
        catalog.code,
        catalog.status,
        catalog.key,
        catalog.detail
      )
    }

    alliance.allianceActive = 1
    await alliance.save()
    return alliance
  }

  async deactivateAlliance(allianceId: number): Promise<Alliance> {
    const alliance = await this.getAlliance(allianceId)

    if (alliance.allianceActive === 0) {
      const catalog = ALLIANCE_ERRORS.ALREADY_INACTIVE
      throw new AllianceServiceError(
        catalog.detail,
        catalog.code,
        catalog.status,
        catalog.key,
        catalog.detail
      )
    }

    alliance.allianceActive = 0
    await alliance.save()
    return alliance
  }
}
