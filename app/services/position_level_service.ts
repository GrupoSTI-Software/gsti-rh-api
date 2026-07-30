import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { I18n } from '@adonisjs/i18n'
import BusinessUnit from '#models/business_unit'
import PositionLevel from '#models/position_level'
import Role from '#models/role'
import RoleService from '#services/role_service'
import PositionLevelServiceError from '#exceptions/position_level_service_error'
import { POSITION_LEVEL_ERROR_CODES } from '#constants/position_level_error_codes'
import { escapeLikePattern, normalizeForSearch } from '#utils/org_alias_normalize'
import type { PositionLevelFilterSearchInterface } from 'app/interfaces/position_level_filter_search_interface.js'

/**
 * Reglas de negocio del catálogo de niveles de puesto (USRH1785273891312).
 * Toda la lógica vive aquí: unicidad de nombre por empresa (regla 2),
 * renumeración transaccional (regla 3), baja lógica solo sin uso (reglas 5/6)
 * y permiso vigente de estructura organizacional (regla 9).
 */
export default class PositionLevelService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /** Mismos slugs con acceso implícito que `OrgChartMoveService` (regla 9). */
  private static readonly ORG_CHART_ADMIN_SLUGS = ['root', 'super-administrador', 'owner'] as const

  /**
   * Regla 9 — el catálogo usa el permiso vigente del organigrama
   * (módulo `organization-chart`): lecturas `read`, escrituras `update`.
   */
  async assertCanAccess(roleId: number | null | undefined, action: 'read' | 'update') {
    const forbidden = () =>
      new PositionLevelServiceError({
        key: 'sin-permiso',
        errorCode: POSITION_LEVEL_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
        title: this.t('position_level_forbidden_title'),
        detail: this.t('position_level_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      throw forbidden()
    }

    if (PositionLevelService.ORG_CHART_ADMIN_SLUGS.some((slug) => slug === role.roleSlug)) {
      return
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(roleId, 'organization-chart', action)
    if (!hasAccess) {
      throw forbidden()
    }
  }

  async list(filters: PositionLevelFilterSearchInterface) {
    const positionLevels = await PositionLevel.query()
      .where('business_unit_id', filters.businessUnitId)
      .whereNull('position_level_deleted_at')
      .if(filters.active !== undefined, (query) => {
        query.where('position_level_active', filters.active === true ? 1 : 0)
      })
      .if(filters.search, (query) => {
        query.whereRaw('LOWER(position_level_name) LIKE ?', [
          `%${escapeLikePattern(normalizeForSearch(filters.search!))}%`,
        ])
      })
      .orderBy('position_level_rank', 'asc')
      .orderBy('position_level_id', 'asc')
    return positionLevels
  }

  async show(positionLevelId: number, businessUnitScope: number[]) {
    const positionLevel = await PositionLevel.query()
      .whereNull('position_level_deleted_at')
      .whereIn('business_unit_id', businessUnitScope)
      .where('position_level_id', positionLevelId)
      .first()

    if (!positionLevel) {
      throw this.notFoundError()
    }
    return positionLevel
  }

  async create(
    input: { businessUnitId: number; positionLevelName: string; positionLevelRank?: number },
    businessUnitScope: number[]
  ) {
    await this.verifyBusinessUnit(input.businessUnitId, businessUnitScope)

    return await db.transaction(async (trx) => {
      const siblings = await this.lockBusinessUnitLevels(input.businessUnitId, trx)
      this.assertNameAvailable(siblings, input.positionLevelName)

      const maxRank = siblings.reduce((max, level) => Math.max(max, level.positionLevelRank), 0)

      const positionLevel = new PositionLevel()
      positionLevel.useTransaction(trx)
      positionLevel.businessUnitId = input.businessUnitId
      positionLevel.positionLevelName = input.positionLevelName.trim()
      positionLevel.positionLevelRank = input.positionLevelRank ?? maxRank + 1
      positionLevel.positionLevelActive = true
      await positionLevel.save()
      return positionLevel
    })
  }

  async update(
    positionLevelId: number,
    input: { positionLevelName: string; positionLevelRank: number },
    businessUnitScope: number[]
  ) {
    return await db.transaction(async (trx) => {
      const positionLevel = await this.lockLevel(positionLevelId, businessUnitScope, trx)
      const siblings = await this.lockBusinessUnitLevels(positionLevel.businessUnitId, trx)
      this.assertNameAvailable(siblings, input.positionLevelName, positionLevelId)

      positionLevel.positionLevelName = input.positionLevelName.trim()
      positionLevel.positionLevelRank = input.positionLevelRank
      await positionLevel.save()
      return positionLevel
    })
  }

  async setActive(
    positionLevelId: number,
    positionLevelActive: boolean,
    businessUnitScope: number[]
  ) {
    const positionLevel = await this.show(positionLevelId, businessUnitScope)
    positionLevel.positionLevelActive = positionLevelActive
    await positionLevel.save()
    return positionLevel
  }

  /**
   * Regla 3 — renumera la secuencia completa 1..n dentro de una transacción.
   * La lista debe cubrir exactamente todos los niveles vigentes de la empresa.
   */
  async reorder(
    businessUnitId: number,
    orderedPositionLevelIds: number[],
    businessUnitScope: number[]
  ) {
    await this.verifyBusinessUnit(businessUnitId, businessUnitScope)

    const uniqueIds = new Set(orderedPositionLevelIds)
    if (uniqueIds.size !== orderedPositionLevelIds.length) {
      throw this.reorderInvalidError()
    }

    return await db.transaction(async (trx) => {
      const current = await this.lockBusinessUnitLevels(businessUnitId, trx)
      const currentIds = new Set(current.map((level) => level.positionLevelId))
      const coversAll =
        current.length === orderedPositionLevelIds.length &&
        orderedPositionLevelIds.every((id) => currentIds.has(id))

      if (!coversAll) {
        throw this.reorderInvalidError()
      }

      const byId = new Map(current.map((level) => [level.positionLevelId, level]))
      for (const [index, id] of orderedPositionLevelIds.entries()) {
        const level = byId.get(id)!
        level.useTransaction(trx)
        level.positionLevelRank = index + 1
        await level.save()
      }

      return orderedPositionLevelIds.map((id) => byId.get(id)!)
    })
  }

  /** Reglas 5 y 6 — baja lógica solo cuando ningún puesto usa el nivel. */
  async delete(positionLevelId: number, businessUnitScope: number[]) {
    const positionLevel = await this.show(positionLevelId, businessUnitScope)

    if (await this.isInUse(positionLevelId)) {
      throw new PositionLevelServiceError({
        key: 'nivel-en-uso',
        errorCode: POSITION_LEVEL_ERROR_CODES.IN_USE,
        httpStatus: 409,
        title: this.t('position_level_in_use_title'),
        detail: this.t('position_level_in_use_message'),
      })
    }

    await positionLevel.delete()
    return positionLevel
  }

  /**
   * Punto ÚNICO de verificación de uso (R-1 del spec). USRH1785273891313 lo
   * completa con la consulta a `position_position_levels`; mientras no exista
   * consumidor, ningún nivel está en uso. NO mover fuera del servicio.
   */
  async isInUse(_positionLevelId: number): Promise<boolean> {
    return false
  }

  /**
   * La razón social debe existir, no estar eliminada y pertenecer al scope
   * del usuario (defensa en profundidad, spec §12).
   */
  private async verifyBusinessUnit(businessUnitId: number, businessUnitScope: number[]) {
    const refInvalid = () =>
      new PositionLevelServiceError({
        key: 'referencia-invalida',
        errorCode: POSITION_LEVEL_ERROR_CODES.REF_INVALID,
        httpStatus: 422,
        title: this.t('position_level_ref_invalid_title'),
        detail: this.t('position_level_ref_invalid_message'),
      })

    if (!businessUnitScope.includes(businessUnitId)) {
      throw refInvalid()
    }

    const businessUnit = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', businessUnitId)
      .first()

    if (!businessUnit) {
      throw refInvalid()
    }
  }

  /**
   * Regla 2 — nombre único por empresa excluyendo eliminados, comparado con
   * `normalizeForSearch` para que "Sénior" y "senior" colisionen. Se invoca
   * sobre filas ya bloqueadas (`forUpdate`) dentro de la transacción (R-2).
   */
  private assertNameAvailable(siblings: PositionLevel[], name: string, excludeId?: number) {
    const normalized = normalizeForSearch(name)
    const taken = siblings.some(
      (level) =>
        level.positionLevelId !== excludeId &&
        normalizeForSearch(level.positionLevelName) === normalized
    )

    if (taken) {
      throw new PositionLevelServiceError({
        key: 'nivel-nombre-duplicado',
        errorCode: POSITION_LEVEL_ERROR_CODES.NAME_TAKEN,
        httpStatus: 409,
        title: this.t('position_level_name_taken_title'),
        detail: this.t('position_level_name_taken_message'),
      })
    }
  }

  private async lockLevel(
    positionLevelId: number,
    businessUnitScope: number[],
    trx: TransactionClientContract
  ) {
    const positionLevel = await PositionLevel.query({ client: trx })
      .whereNull('position_level_deleted_at')
      .whereIn('business_unit_id', businessUnitScope)
      .where('position_level_id', positionLevelId)
      .forUpdate()
      .first()

    if (!positionLevel) {
      throw this.notFoundError()
    }
    return positionLevel
  }

  private async lockBusinessUnitLevels(businessUnitId: number, trx: TransactionClientContract) {
    return await PositionLevel.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .whereNull('position_level_deleted_at')
      .forUpdate()
  }

  private notFoundError() {
    return new PositionLevelServiceError({
      key: 'nivel-no-encontrado',
      errorCode: POSITION_LEVEL_ERROR_CODES.NOT_FOUND,
      httpStatus: 404,
      title: this.t('position_level_not_found_title'),
      detail: this.t('position_level_not_found_message'),
    })
  }

  private reorderInvalidError() {
    return new PositionLevelServiceError({
      key: 'orden-invalido',
      errorCode: POSITION_LEVEL_ERROR_CODES.REORDER_INVALID,
      httpStatus: 422,
      title: this.t('position_level_reorder_invalid_title'),
      detail: this.t('position_level_reorder_invalid_message'),
    })
  }
}
