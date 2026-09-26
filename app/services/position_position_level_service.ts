import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { I18n } from '@adonisjs/i18n'
import Position from '#models/position'
import PositionLevel from '#models/position_level'
import PositionPositionLevel from '#models/position_position_level'
import Role from '#models/role'
import RoleService from '#services/role_service'
import PositionPositionLevelServiceError from '#exceptions/position_position_level_service_error'
import { POSITION_POSITION_LEVEL_ERROR_CODES } from '#constants/position_position_level_error_codes'
import { normalizeForSearch } from '#utils/org_alias_normalize'
import type { PositionPositionLevelFilterInterface } from 'app/interfaces/position_position_level_filter_interface.js'
import type {
  PositionPositionLevelRowInput,
  PositionPositionLevelView,
} from 'app/interfaces/position_position_level_replace_interface.js'

/** Renglón del payload ya normalizado: rank renumerado 1..n y ad-hoc con trim. */
type NormalizedRow = {
  positionPositionLevelId: number | null
  positionLevelId: number | null
  adHocName: string | null
  isDefault: boolean
  active: boolean
  rank: number
}

/**
 * Reglas de negocio de la configuración de niveles por puesto
 * (USRH1785273891313). Toda la lógica del conjunto vive aquí: XOR de fuente
 * (regla 5), unicidad dentro del puesto (reglas 3 y 6), catálogo vigente de la
 * propia empresa (reglas 2 y 13), default único sobre nivel activo (regla 8),
 * guardia de personal asignado (regla 10) y permiso vigente del organigrama
 * (regla 14) — validadas sobre el bloque completo dentro de una transacción.
 */
export default class PositionPositionLevelService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /** Mismos slugs con acceso implícito que `OrgChartMoveService` (regla 14). */
  private static readonly ORG_CHART_ADMIN_SLUGS = ['root', 'super-administrador', 'owner'] as const

  /**
   * Regla 14 — la configuración usa el permiso vigente del organigrama
   * (módulo `organization-chart`): lecturas `read`, escrituras `update`.
   */
  async assertCanAccess(roleId: number | null | undefined, action: 'read' | 'update') {
    const forbidden = () =>
      new PositionPositionLevelServiceError({
        key: 'sin-permiso',
        errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
        title: this.t('position_position_level_forbidden_title'),
        detail: this.t('position_position_level_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      throw forbidden()
    }

    if (PositionPositionLevelService.ORG_CHART_ADMIN_SLUGS.some((slug) => slug === role.roleSlug)) {
      return
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(roleId, 'organization-chart', action)
    if (!hasAccess) {
      throw forbidden()
    }
  }

  /** CA-10 — lista ordenada por rank que consumen las cuatro HUs posteriores. */
  async index(
    positionId: number,
    filters: PositionPositionLevelFilterInterface,
    businessUnitScope: number[]
  ): Promise<PositionPositionLevelView[]> {
    await this.findPositionInScope(positionId, businessUnitScope)

    const rows = await PositionPositionLevel.query()
      .whereNull('position_position_level_deleted_at')
      .where('position_id', positionId)
      .if(filters.active !== undefined, (query) => {
        query.where('position_position_level_active', filters.active === true ? 1 : 0)
      })
      .preload('positionLevel')
      .orderBy('position_position_level_rank', 'asc')
      .orderBy('position_position_level_id', 'asc')

    return rows.map((row) => this.toView(row))
  }

  /**
   * CA-11 — reemplazo transaccional del bloque completo. Las filas vivas que
   * no vengan en el bloque se dan de baja lógica, salvo que tengan personal
   * asignado (regla 10), en cuyo caso la transacción completa se revierte.
   */
  async replace(
    positionId: number,
    rows: PositionPositionLevelRowInput[],
    businessUnitScope: number[]
  ): Promise<PositionPositionLevelView[]> {
    return await db.transaction(async (trx) => {
      // El lock del puesto serializa reemplazos concurrentes del mismo bloque (R-3)
      const position = await this.lockPositionInScope(positionId, businessUnitScope, trx)
      const existing = await this.lockPositionRows(positionId, trx)

      const normalized = this.normalizeRows(rows)
      this.assertSingleSourcePerRow(normalized)
      this.assertNoDuplicatesInPayload(normalized)

      const matches = this.matchAgainstExisting(normalized, existing)
      const catalogLevels = await this.verifyCatalogLevels(normalized, matches, position, trx)
      this.assertAdHocNamesDontCollideWithCatalog(normalized, catalogLevels)
      this.assertDefaultRules(normalized)

      // Bajas: filas vivas ausentes del bloque (regla 10 aborta TODO el bloque)
      const matchedIds = new Set(
        [...matches.values()].map((row) => row.positionPositionLevelId)
      )
      for (const row of existing) {
        if (matchedIds.has(row.positionPositionLevelId)) continue
        if (await this.hasAssignedEmployees(row.positionPositionLevelId)) {
          throw this.hasEmployeesError()
        }
        row.useTransaction(trx)
        await row.delete()
      }

      // Updates y altas
      for (const row of normalized) {
        const matched = matches.get(row)
        if (matched) {
          matched.useTransaction(trx)
          matched.positionPositionLevelRank = row.rank
          matched.positionPositionLevelIsDefault = row.isDefault
          matched.positionPositionLevelActive = row.active
          if (matched.positionLevelId === null) {
            matched.positionPositionLevelAdHocName = row.adHocName
          }
          await matched.save()
          continue
        }

        const created = new PositionPositionLevel()
        created.useTransaction(trx)
        created.positionId = positionId
        // Derivada del puesto, nunca del payload (regla 13); el hook
        // @beforeCreate queda como defensa en profundidad.
        created.businessUnitId = position.businessUnitId
        created.positionLevelId = row.positionLevelId
        created.positionPositionLevelAdHocName = row.positionLevelId === null ? row.adHocName : null
        created.positionPositionLevelRank = row.rank
        created.positionPositionLevelIsDefault = row.isDefault
        created.positionPositionLevelActive = row.active
        await created.save()
      }

      const result = await PositionPositionLevel.query({ client: trx })
        .whereNull('position_position_level_deleted_at')
        .where('position_id', positionId)
        .preload('positionLevel')
        .orderBy('position_position_level_rank', 'asc')
        .orderBy('position_position_level_id', 'asc')

      return result.map((row) => this.toView(row))
    })
  }

  /**
   * CA-8 — quita un renglón individual con la guardia de personal asignado
   * (regla 10) y renumera la secuencia restante 1..n.
   */
  async deleteOne(
    positionId: number,
    positionPositionLevelId: number,
    businessUnitScope: number[]
  ): Promise<PositionPositionLevelView> {
    return await db.transaction(async (trx) => {
      await this.lockPositionInScope(positionId, businessUnitScope, trx)

      const row = await PositionPositionLevel.query({ client: trx })
        .whereNull('position_position_level_deleted_at')
        .where('position_id', positionId)
        .where('position_position_level_id', positionPositionLevelId)
        .forUpdate()
        .first()

      if (!row) {
        // 404 indistinguible para no filtrar existencia (spec §12)
        throw this.positionNotFoundError()
      }

      if (await this.hasAssignedEmployees(positionPositionLevelId)) {
        throw this.hasEmployeesError()
      }

      row.useTransaction(trx)
      // Si era el default, el puesto queda sin default (regla 9): sin promoción
      await row.delete()

      const remaining = await this.lockPositionRows(positionId, trx)
      for (const [index, sibling] of remaining.entries()) {
        if (sibling.positionPositionLevelRank === index + 1) continue
        sibling.useTransaction(trx)
        sibling.positionPositionLevelRank = index + 1
        await sibling.save()
      }

      await row.load('positionLevel')
      return this.toView(row)
    })
  }

  /**
   * Punto ÚNICO de verificación de personal asignado (regla 10, completado
   * por USRH1785964117188). Cuenta todo empleado con expediente registrado
   * (`employee_deleted_at IS NULL`), incluidos los dados de baja/terminados;
   * solo el soft-delete del expediente deja de contar — sin filtro de
   * estatus laboral. NO mover fuera del servicio. Público porque los tests
   * lo subclasean.
   */
  async hasAssignedEmployees(positionPositionLevelId: number): Promise<boolean> {
    const row = await db
      .from('employees')
      .where('position_level_config_id', positionPositionLevelId)
      .whereNull('employee_deleted_at')
      .first()
    return Boolean(row)
  }

  /** Rank 1..n por el orden del payload (ordenado por rank recibido) y trim de ad-hoc. */
  private normalizeRows(rows: PositionPositionLevelRowInput[]): NormalizedRow[] {
    return rows
      .map((row, index) => ({
        positionPositionLevelId: row.positionPositionLevelId ?? null,
        positionLevelId: row.positionLevelId ?? null,
        adHocName:
          typeof row.positionPositionLevelAdHocName === 'string'
            ? row.positionPositionLevelAdHocName.trim()
            : null,
        isDefault: row.positionPositionLevelIsDefault,
        active: row.positionPositionLevelActive,
        givenRank: row.positionPositionLevelRank,
        index,
      }))
      .sort((a, b) => a.givenRank - b.givenRank || a.index - b.index)
      .map((row, position) => ({
        positionPositionLevelId: row.positionPositionLevelId,
        positionLevelId: row.positionLevelId,
        adHocName: row.adHocName,
        isDefault: row.isDefault,
        active: row.active,
        rank: position + 1,
      }))
  }

  /**
   * Regla 5 — XOR estricto: nivel del catálogo o nombre propio, exactamente
   * uno. El bodyparser convierte `""` en `null` (convertEmptyStringsToNull),
   * así que un renglón sin ninguna fuente es indistinguible de un ad-hoc con
   * nombre vacío; CA-4 fija ese caso como `nivel-propio-sin-nombre`.
   */
  private assertSingleSourcePerRow(rows: NormalizedRow[]) {
    for (const row of rows) {
      const hasCatalog = row.positionLevelId !== null
      const hasAdHocName = row.adHocName !== null && row.adHocName !== ''

      if (hasCatalog && hasAdHocName) {
        throw this.sourceAmbiguousError()
      }
      if (!hasCatalog && !hasAdHocName) {
        throw this.adHocNameRequiredError()
      }
    }
  }

  /** Reglas 3 y 6 — sin repetir nivel del catálogo ni nombre dentro del bloque. */
  private assertNoDuplicatesInPayload(rows: NormalizedRow[]) {
    const catalogIds = new Set<number>()
    const adHocNames = new Set<string>()

    for (const row of rows) {
      if (row.positionLevelId !== null) {
        if (catalogIds.has(row.positionLevelId)) {
          throw this.duplicateLevelError()
        }
        catalogIds.add(row.positionLevelId)
        continue
      }

      const normalized = normalizeForSearch(row.adHocName!)
      if (adHocNames.has(normalized)) {
        throw this.duplicateLevelError()
      }
      adHocNames.add(normalized)
    }
  }

  /**
   * Empareja cada renglón con su fila viva para preservar identidad entre
   * guardados: primero por `positionPositionLevelId`, con fallback por nivel
   * del catálogo o por nombre ad-hoc normalizado. Un id caduco o un cambio de
   * fuente sobre una fila existente es payload inválido (400).
   */
  private matchAgainstExisting(
    rows: NormalizedRow[],
    existing: PositionPositionLevel[]
  ): Map<NormalizedRow, PositionPositionLevel> {
    const byId = new Map(existing.map((row) => [row.positionPositionLevelId, row]))
    const byCatalogLevel = new Map(
      existing
        .filter((row) => row.positionLevelId !== null)
        .map((row) => [row.positionLevelId!, row])
    )
    const byAdHocName = new Map(
      existing
        .filter((row) => row.positionLevelId === null)
        .map((row) => [normalizeForSearch(row.positionPositionLevelAdHocName ?? ''), row])
    )

    const matches = new Map<NormalizedRow, PositionPositionLevel>()

    for (const row of rows) {
      if (row.positionPositionLevelId !== null) {
        const matched = byId.get(row.positionPositionLevelId)
        if (!matched) {
          throw this.invalidInputError()
        }
        const matchedIsCatalog = matched.positionLevelId !== null
        const rowIsCatalog = row.positionLevelId !== null
        if (matchedIsCatalog !== rowIsCatalog) {
          throw this.invalidInputError()
        }
        if (matchedIsCatalog && matched.positionLevelId !== row.positionLevelId) {
          throw this.invalidInputError()
        }
        matches.set(row, matched)
        continue
      }

      if (row.positionLevelId !== null) {
        const matched = byCatalogLevel.get(row.positionLevelId)
        if (matched) {
          matches.set(row, matched)
        }
        continue
      }

      const matched = byAdHocName.get(normalizeForSearch(row.adHocName!))
      if (matched) {
        matches.set(row, matched)
      }
    }

    return matches
  }

  /**
   * Reglas 2 y 13 — todo nivel del catálogo referido debe existir, no estar
   * eliminado y pertenecer a la empresa del puesto. El requisito de estar
   * activo aplica solo a activaciones nuevas: una fila ya persistida cuyo
   * nivel fue desactivado después en el catálogo se conserva (regla 11).
   */
  private async verifyCatalogLevels(
    rows: NormalizedRow[],
    matches: Map<NormalizedRow, PositionPositionLevel>,
    position: Position,
    trx: TransactionClientContract
  ): Promise<PositionLevel[]> {
    const catalogRows = rows.filter((row) => row.positionLevelId !== null)
    if (catalogRows.length === 0) {
      return []
    }

    const ids = [...new Set(catalogRows.map((row) => row.positionLevelId!))]
    // El lock evita que el catálogo cambie a media transacción (R-3)
    const levels = await PositionLevel.query({ client: trx })
      .whereNull('position_level_deleted_at')
      .where('business_unit_id', position.businessUnitId)
      .whereIn('position_level_id', ids)
      .forUpdate()

    const byId = new Map(levels.map((level) => [level.positionLevelId, level]))

    for (const row of catalogRows) {
      const level = byId.get(row.positionLevelId!)
      if (!level) {
        throw this.notInCatalogError()
      }
      if (!level.positionLevelActive && !matches.has(row)) {
        throw this.notInCatalogError()
      }
    }

    return levels
  }

  /** Regla 6 — un ad-hoc no puede llamarse como un nivel del catálogo activado ahí. */
  private assertAdHocNamesDontCollideWithCatalog(
    rows: NormalizedRow[],
    catalogLevels: PositionLevel[]
  ) {
    if (catalogLevels.length === 0) {
      return
    }

    const catalogNames = new Set(
      catalogLevels.map((level) => normalizeForSearch(level.positionLevelName))
    )
    const collision = rows.some(
      (row) =>
        row.positionLevelId === null && catalogNames.has(normalizeForSearch(row.adHocName!))
    )

    if (collision) {
      throw this.duplicateLevelError()
    }
  }

  /** Regla 8 — máximo un default por bloque y solo sobre un renglón activo. */
  private assertDefaultRules(rows: NormalizedRow[]) {
    const defaults = rows.filter((row) => row.isDefault)
    if (defaults.length > 1) {
      throw new PositionPositionLevelServiceError({
        key: 'mas-de-un-nivel-default',
        errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.MULTIPLE_DEFAULT,
        httpStatus: 409,
        title: this.t('position_position_level_multiple_default_title'),
        detail: this.t('position_position_level_multiple_default_message'),
      })
    }

    if (defaults.some((row) => !row.active)) {
      throw new PositionPositionLevelServiceError({
        key: 'default-en-nivel-inactivo',
        errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.DEFAULT_ON_INACTIVE,
        httpStatus: 422,
        title: this.t('position_position_level_default_on_inactive_title'),
        detail: this.t('position_position_level_default_on_inactive_message'),
      })
    }
  }

  /** 404 indistinguible: puesto inexistente y puesto fuera de scope responden igual. */
  private async findPositionInScope(positionId: number, businessUnitScope: number[]) {
    const position = await Position.query()
      .whereNull('position_deleted_at')
      .whereIn('business_unit_id', businessUnitScope)
      .where('position_id', positionId)
      .first()

    if (!position) {
      throw this.positionNotFoundError()
    }
    return position
  }

  private async lockPositionInScope(
    positionId: number,
    businessUnitScope: number[],
    trx: TransactionClientContract
  ) {
    const position = await Position.query({ client: trx })
      .whereNull('position_deleted_at')
      .whereIn('business_unit_id', businessUnitScope)
      .where('position_id', positionId)
      .forUpdate()
      .first()

    if (!position) {
      throw this.positionNotFoundError()
    }
    return position
  }

  private async lockPositionRows(positionId: number, trx: TransactionClientContract) {
    return await PositionPositionLevel.query({ client: trx })
      .whereNull('position_position_level_deleted_at')
      .where('position_id', positionId)
      .orderBy('position_position_level_rank', 'asc')
      .orderBy('position_position_level_id', 'asc')
      .forUpdate()
  }

  private toView(row: PositionPositionLevel): PositionPositionLevelView {
    return {
      positionPositionLevelId: row.positionPositionLevelId,
      positionLevelId: row.positionLevelId,
      positionPositionLevelAdHocName: row.positionPositionLevelAdHocName,
      displayName: row.displayName,
      source: row.source,
      positionPositionLevelRank: row.positionPositionLevelRank,
      positionPositionLevelIsDefault: row.positionPositionLevelIsDefault,
      positionPositionLevelActive: row.positionPositionLevelActive,
    }
  }

  private positionNotFoundError() {
    return new PositionPositionLevelServiceError({
      key: 'puesto-no-encontrado',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.POSITION_NOT_FOUND,
      httpStatus: 404,
      title: this.t('position_position_level_position_not_found_title'),
      detail: this.t('position_position_level_position_not_found_message'),
    })
  }

  private sourceAmbiguousError() {
    return new PositionPositionLevelServiceError({
      key: 'nivel-origen-ambiguo',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.LEVEL_SOURCE_AMBIGUOUS,
      httpStatus: 422,
      title: this.t('position_position_level_source_ambiguous_title'),
      detail: this.t('position_position_level_source_ambiguous_message'),
    })
  }

  private adHocNameRequiredError() {
    return new PositionPositionLevelServiceError({
      key: 'nivel-propio-sin-nombre',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.AD_HOC_NAME_REQUIRED,
      httpStatus: 422,
      title: this.t('position_position_level_ad_hoc_name_required_title'),
      detail: this.t('position_position_level_ad_hoc_name_required_message'),
    })
  }

  private duplicateLevelError() {
    return new PositionPositionLevelServiceError({
      key: 'nivel-duplicado-en-puesto',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.DUPLICATE_LEVEL,
      httpStatus: 409,
      title: this.t('position_position_level_duplicate_title'),
      detail: this.t('position_position_level_duplicate_message'),
    })
  }

  private notInCatalogError() {
    return new PositionPositionLevelServiceError({
      key: 'nivel-fuera-de-catalogo',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.LEVEL_NOT_IN_CATALOG,
      httpStatus: 422,
      title: this.t('position_position_level_not_in_catalog_title'),
      detail: this.t('position_position_level_not_in_catalog_message'),
    })
  }

  private hasEmployeesError() {
    return new PositionPositionLevelServiceError({
      key: 'nivel-con-personal-asignado',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.LEVEL_HAS_EMPLOYEES,
      httpStatus: 409,
      title: this.t('position_position_level_has_employees_title'),
      detail: this.t('position_position_level_has_employees_message'),
    })
  }

  private invalidInputError() {
    return new PositionPositionLevelServiceError({
      key: 'datos-invalidos',
      errorCode: POSITION_POSITION_LEVEL_ERROR_CODES.VAL_INPUT,
      httpStatus: 400,
      title: this.t('position_position_level_val_input_title'),
      detail: this.t('position_position_level_val_input_message'),
    })
  }
}
