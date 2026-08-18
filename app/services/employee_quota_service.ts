import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BillingSubscription, {
  LIVE_SUBSCRIPTION_STATUSES,
} from '#models/billing_subscription'
import BusinessUnit, { type BusinessUnitOrigin } from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import SystemSettingsEmployee from '#models/system_settings_employee'
import {
  employeeQuotaExceededError,
  employeeQuotaNoPlanError,
} from '../helpers/employee_quota_api_error.js'

export type QuotaSource = 'subscription' | 'legacy' | 'no_plan' | 'none'

export interface EmployeeQuota {
  limit: number | null
  source: QuotaSource
}

/**
 * Fuente única del cupo de empleados y del conteo de vigentes por empresa
 * (USRH1785441817258). Las vías de alta consultan aquí; no reimplementan la regla.
 */
export default class EmployeeQuotaService {
  /**
   * Resuelve el cupo efectivo según origen de la empresa y contratación vigente (§6.1).
   */
  async resolveQuota(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<EmployeeQuota> {
    const businessUnit = await this.loadBusinessUnit(businessUnitId, trx)
    if (!businessUnit) {
      logger.warn(
        { businessUnitId },
        'EmployeeQuotaService.resolveQuota: empresa no encontrada; se trata como platform sin tope'
      )
      return { limit: null, source: 'none' }
    }

    const origin = this.normalizeOrigin(businessUnit.businessUnitOrigin)
    const live = await this.loadLiveSubscription(businessUnitId, trx)

    if (origin === 'self_service') {
      if (!live) {
        return { limit: 0, source: 'no_plan' }
      }

      const contracted = live.billingSubscriptionContractedEmployees
      if (contracted > 0) {
        return { limit: contracted, source: 'subscription' }
      }

      logger.warn(
        { businessUnitId, contracted },
        'EmployeeQuotaService.resolveQuota: suscripción viva con cantidad no positiva; cupo cero (fail-closed)'
      )
      return { limit: 0, source: 'subscription' }
    }

    if (live && live.billingSubscriptionContractedEmployees > 0) {
      return {
        limit: live.billingSubscriptionContractedEmployees,
        source: 'subscription',
      }
    }

    const legacy = await this.getLegacyEmployeeLimit(businessUnit, trx)
    if (legacy !== null && legacy > 0) {
      return { limit: legacy, source: 'legacy' }
    }

    return { limit: null, source: 'none' }
  }

  /**
   * Conteo canónico de empleados vigentes para el cupo (§7).
   * Usa `db.from` para evitar el mixin `withBusinessUnitScope()` del modelo Employee.
   */
  async countActiveEmployees(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<number> {
    const client = trx ?? db
    const row = await client
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .whereNull('employee_deleted_at')
      .whereNull('employee_terminated_date')
      .count('* as total')
      .first()

    return Number((row as { total: string | number } | null)?.total ?? 0)
  }

  /**
   * Conteo canónico en lote, mismo criterio que `countActiveEmployees` (§9.1
   * de USRH1785962095089). Evita reintroducir un `from('employees')` propio
   * en cada consumidor que necesita el conteo de varias empresas a la vez
   * (p. ej. el picker de alta de suscripciones).
   */
  async countActiveEmployeesByBusinessUnits(
    businessUnitIds: number[],
    trx?: TransactionClientContract
  ): Promise<Map<number, number>> {
    if (businessUnitIds.length === 0) {
      return new Map()
    }

    const client = trx ?? db
    const rows = await client
      .from('employees')
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_deleted_at')
      .whereNull('employee_terminated_date')
      .groupBy('business_unit_id')
      .select('business_unit_id')
      .count('* as total')

    const countByBusinessUnitId = new Map<number, number>()
    for (const row of rows as Array<{ business_unit_id: number; total: string | number }>) {
      countByBusinessUnitId.set(Number(row.business_unit_id), Number(row.total))
    }
    return countByBusinessUnitId
  }

  /**
   * Valida que el alta de `incoming` empleado(s) no rebase el cupo.
   * Con `trx`, serializa altas concurrentes con lock pesimista (§12).
   */
  async assertWithinQuota(
    businessUnitId: number,
    incoming: number = 1,
    trx?: TransactionClientContract
  ): Promise<void> {
    // El lock debe ir antes de cualquier lectura dentro de la transacción:
    // en RR MySQL el snapshot se fija en el primer SELECT y un conteo
    // posterior ignoraría altas ya commiteadas por otra tx.
    if (trx) {
      await this.acquireQuotaLockForBusinessUnit(businessUnitId, trx)
    }

    const quota = await this.resolveQuota(businessUnitId, trx)

    if (quota.limit === null) {
      return
    }

    if (quota.source === 'no_plan') {
      const active = await this.countActiveEmployees(businessUnitId, trx)
      throw employeeQuotaNoPlanError(active)
    }

    const limit = quota.limit
    const active = await this.countActiveEmployees(businessUnitId, trx)

    if (active + incoming > limit) {
      throw employeeQuotaExceededError(limit, active)
    }
  }

  /**
   * Serializa validaciones concurrentes: suscripción viva o fila legacy.
   */
  private async acquireQuotaLockForBusinessUnit(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const live = await BillingSubscription.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .forUpdate()
      .first()

    if (live) {
      return
    }

    const businessUnit = await this.loadBusinessUnit(businessUnitId, trx)
    if (businessUnit) {
      await this.lockLegacyLimitRow(businessUnit, trx)
    }
  }

  private async lockLegacyLimitRow(
    businessUnit: BusinessUnit,
    trx: TransactionClientContract
  ): Promise<void> {
    const systemSettings = await SystemSetting.query({ client: trx })
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select('system_setting_id', 'system_setting_business_units')

    let matchingSystemSettingId: number | null = null

    for (const setting of systemSettings) {
      const settingBusinessUnits = setting.systemSettingBusinessUnits
        .split(',')
        .map((unit: string) => unit.trim())

      if (settingBusinessUnits.includes(businessUnit.businessUnitSlug)) {
        matchingSystemSettingId = setting.systemSettingId
        break
      }
    }

    if (matchingSystemSettingId === null) {
      return
    }

    await SystemSettingsEmployee.query({ client: trx })
      .where('is_active', 1)
      .where('system_setting_id', matchingSystemSettingId)
      .whereNull('system_setting_employee_deleted_at')
      .forUpdate()
      .first()
  }

  private normalizeOrigin(origin: BusinessUnitOrigin | null | undefined): BusinessUnitOrigin {
    if (origin === 'self_service' || origin === 'platform') {
      return origin
    }
    return 'platform'
  }

  private async loadBusinessUnit(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<BusinessUnit | null> {
    const query = BusinessUnit.query({ client: trx }).where('business_unit_id', businessUnitId)
    return query.first()
  }

  private async loadLiveSubscription(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<BillingSubscription | null> {
    return BillingSubscription.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .first()
  }

  /**
   * Tope legacy de GSTI (`system_settings_employees.employee_limit`).
   * Espeja la lógica de `EmployeeService.getEmployeeLimitForBusinessUnit` sin modificarla.
   */
  private async getLegacyEmployeeLimit(
    businessUnit: BusinessUnit,
    trx?: TransactionClientContract
  ): Promise<number | null> {
    try {
      const systemSettings = await SystemSetting.query({ client: trx })
        .whereNull('system_setting_deleted_at')
        .where('system_setting_active', 1)
        .select('system_setting_id', 'system_setting_business_units')

      let matchingSystemSettingId: number | null = null

      for (const setting of systemSettings) {
        const settingBusinessUnits = setting.systemSettingBusinessUnits
          .split(',')
          .map((unit: string) => unit.trim())

        if (settingBusinessUnits.includes(businessUnit.businessUnitSlug)) {
          matchingSystemSettingId = setting.systemSettingId
          break
        }
      }

      if (matchingSystemSettingId === null) {
        return null
      }

      const result = await SystemSettingsEmployee.query({ client: trx })
        .where('is_active', 1)
        .where('system_setting_id', matchingSystemSettingId)
        .whereNull('system_setting_employee_deleted_at')
        .first()

      return result ? result.employeeLimit : null
    } catch (error) {
      logger.error(
        { err: error, businessUnitId: businessUnit.businessUnitId },
        'EmployeeQuotaService.getLegacyEmployeeLimit: error al leer tope legacy'
      )
      return null
    }
  }
}
