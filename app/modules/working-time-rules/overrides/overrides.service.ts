import { DateTime } from 'luxon'
import WorkingTimeRule from '#models/working_time_rule'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'
import { workingTimeRuleCache } from '#services/working_time_rule_cache_service'
import OverridesRepositoryMysql from './overrides.repository.mysql.js'
import type { OverridesRepository } from './overrides.repository.js'
import type { CreateOverrideInput, OverrideCaps, UpdateOverrideInput } from './dto/override.dto.js'

/** País de los topes federales que sirven de base para los overrides. */
const COUNTRY_CODE = 'MX'

/** Cap de sanidad absoluto (se rechaza aunque venga la bandera exceeds_federal_ack). */
const SANITY_MAX_WEEKLY_HOURS = 60
const SANITY_MAX_WEEKLY_OVERTIME_HOURS = 20

/**
 * Lógica de negocio de los overrides de jornada por empresa.
 *
 * Orquesta el cap de sanidad, la comparación contra el federal vigente por fecha
 * y el armado del registro. El no-traslape y los valores no negativos los valida
 * el modelo en su hook beforeSave al persistir.
 */
export default class OverridesService {
  private readonly repository: OverridesRepository

  constructor(repository: OverridesRepository = new OverridesRepositoryMysql()) {
    this.repository = repository
  }

  /** Lista los overrides de una empresa. */
  async list(businessUnitId: number): Promise<WorkingTimeRule[]> {
    return this.repository.listByBusinessUnit(businessUnitId)
  }

  /** Obtiene un override por id (o null). */
  async findById(id: number): Promise<WorkingTimeRule | null> {
    return this.repository.findOverrideById(id)
  }

  /** Crea un override aplicando todas las validaciones de negocio. */
  async create(input: CreateOverrideInput, authorUserId: number): Promise<WorkingTimeRule> {
    const caps = this.toCaps(input)
    this.assertSanityCap(caps)

    const exceedsFederal = await this.computeExceedsFederal(caps, input.validFrom)
    if (exceedsFederal && input.exceedsFederalAck !== true) {
      throw new WorkingTimeRuleError(
        'override-excede-federal',
        'Override excede el máximo federal',
        'El override supera el tope federal vigente; se requiere la bandera exceeds_federal_ack y una justificación.'
      )
    }

    const attributes: Partial<WorkingTimeRule> = {
      workingTimeRuleCountryCode: COUNTRY_CODE,
      businessUnitId: input.businessUnitId,
      workingTimeRuleEffectiveYear: input.effectiveYear,
      workingTimeRuleValidFrom: DateTime.fromISO(input.validFrom),
      workingTimeRuleValidTo: input.validTo ? DateTime.fromISO(input.validTo) : null,
      ...this.capsToColumns(caps),
      workingTimeRuleExceedsFederal: exceedsFederal,
      workingTimeRuleOverrideJustification: exceedsFederal ? input.overrideJustification : null,
      overrideCreatedByUserId: exceedsFederal ? authorUserId : null,
    }

    const created = await this.repository.create(attributes)
    workingTimeRuleCache.invalidateBusinessUnit(input.businessUnitId)
    return created
  }

  /** Actualiza parcialmente un override existente. */
  async update(
    existing: WorkingTimeRule,
    input: UpdateOverrideInput,
    authorUserId: number
  ): Promise<WorkingTimeRule> {
    const caps = this.toCaps({ ...this.columnsToCaps(existing), ...input })
    this.assertSanityCap(caps)

    const validFrom = input.validFrom ?? existing.workingTimeRuleValidFrom.toISODate() ?? ''
    const exceedsFederal = await this.computeExceedsFederal(caps, validFrom)
    if (exceedsFederal && input.exceedsFederalAck !== true) {
      throw new WorkingTimeRuleError(
        'override-excede-federal',
        'Override excede el máximo federal',
        'El override supera el tope federal vigente; se requiere la bandera exceeds_federal_ack y una justificación.'
      )
    }

    const validTo = this.resolveValidTo(input.validTo, existing.workingTimeRuleValidTo)

    const attributes: Partial<WorkingTimeRule> = {
      workingTimeRuleEffectiveYear: input.effectiveYear ?? existing.workingTimeRuleEffectiveYear,
      workingTimeRuleValidFrom: DateTime.fromISO(validFrom),
      workingTimeRuleValidTo: validTo,
      ...this.capsToColumns(caps),
      workingTimeRuleExceedsFederal: exceedsFederal,
      workingTimeRuleOverrideJustification: exceedsFederal
        ? (input.overrideJustification ?? existing.workingTimeRuleOverrideJustification)
        : null,
      overrideCreatedByUserId: exceedsFederal ? authorUserId : null,
    }

    const updated = await this.repository.update(existing, attributes)
    if (existing.businessUnitId) {
      workingTimeRuleCache.invalidateBusinessUnit(existing.businessUnitId)
    }
    return updated
  }

  /** Borra (lógico) un override. */
  async delete(existing: WorkingTimeRule): Promise<void> {
    const businessUnitId = existing.businessUnitId
    await this.repository.softDelete(existing)
    if (businessUnitId) {
      workingTimeRuleCache.invalidateBusinessUnit(businessUnitId)
    }
  }

  /** Resuelve validTo en un PATCH: undefined conserva el actual; null lo deja indefinido. */
  private resolveValidTo(
    incoming: string | null | undefined,
    current: DateTime | null
  ): DateTime | null {
    if (incoming === undefined) {
      return current
    }
    return incoming ? DateTime.fromISO(incoming) : null
  }

  /** Rechaza valores groseros aunque venga la bandera de deslinde. */
  private assertSanityCap(caps: OverrideCaps) {
    if (
      caps.maxWeeklyHours > SANITY_MAX_WEEKLY_HOURS ||
      caps.maxWeeklyOvertimeHours > SANITY_MAX_WEEKLY_OVERTIME_HOURS
    ) {
      throw new WorkingTimeRuleError(
        'valor-fuera-de-rango',
        'Valor fuera de rango',
        `La jornada semanal no puede superar ${SANITY_MAX_WEEKLY_HOURS} h ni las horas extra semanales ${SANITY_MAX_WEEKLY_OVERTIME_HOURS} h.`
      )
    }
  }

  /** True si algún tope del override es mayor que el federal vigente por fecha. */
  private async computeExceedsFederal(caps: OverrideCaps, validFrom: string): Promise<boolean> {
    const federal = await this.repository.findFederalForDate(COUNTRY_CODE, validFrom)
    if (!federal) {
      // Sin federal de referencia no hay base para considerar "excede".
      return false
    }

    const federalCaps = this.columnsToCaps(federal)
    return (
      caps.maxWeeklyHours > federalCaps.maxWeeklyHours ||
      caps.maxWeeklyOvertimeHours > federalCaps.maxWeeklyOvertimeHours ||
      caps.maxDailyOvertimeHours > federalCaps.maxDailyOvertimeHours ||
      caps.maxOvertimeDaysPerWeek > federalCaps.maxOvertimeDaysPerWeek ||
      caps.dailyHoursDay > federalCaps.dailyHoursDay ||
      caps.dailyHoursNight > federalCaps.dailyHoursNight ||
      caps.dailyHoursMixed > federalCaps.dailyHoursMixed ||
      caps.workDaysPerRestDay > federalCaps.workDaysPerRestDay
    )
  }

  /** Normaliza un input (parcial o completo) a los topes numéricos. */
  private toCaps(input: OverrideCaps): OverrideCaps {
    return {
      maxWeeklyHours: input.maxWeeklyHours,
      maxWeeklyOvertimeHours: input.maxWeeklyOvertimeHours,
      maxDailyOvertimeHours: input.maxDailyOvertimeHours,
      maxOvertimeDaysPerWeek: input.maxOvertimeDaysPerWeek,
      dailyHoursDay: input.dailyHoursDay,
      dailyHoursNight: input.dailyHoursNight,
      dailyHoursMixed: input.dailyHoursMixed,
      workDaysPerRestDay: input.workDaysPerRestDay,
    }
  }

  /** Extrae los topes de un registro persistido. */
  private columnsToCaps(rule: WorkingTimeRule): OverrideCaps {
    return {
      maxWeeklyHours: rule.workingTimeRuleMaxWeeklyHours,
      maxWeeklyOvertimeHours: rule.workingTimeRuleMaxWeeklyOvertimeHours,
      maxDailyOvertimeHours: rule.workingTimeRuleMaxDailyOvertimeHours,
      maxOvertimeDaysPerWeek: rule.workingTimeRuleMaxOvertimeDaysPerWeek,
      dailyHoursDay: rule.workingTimeRuleDailyHoursDay,
      dailyHoursNight: rule.workingTimeRuleDailyHoursNight,
      dailyHoursMixed: rule.workingTimeRuleDailyHoursMixed,
      workDaysPerRestDay: rule.workingTimeRuleWorkDaysPerRestDay,
    }
  }

  /** Traduce los topes a los nombres de columna del modelo. */
  private capsToColumns(caps: OverrideCaps): Partial<WorkingTimeRule> {
    return {
      workingTimeRuleMaxWeeklyHours: caps.maxWeeklyHours,
      workingTimeRuleMaxWeeklyOvertimeHours: caps.maxWeeklyOvertimeHours,
      workingTimeRuleMaxDailyOvertimeHours: caps.maxDailyOvertimeHours,
      workingTimeRuleMaxOvertimeDaysPerWeek: caps.maxOvertimeDaysPerWeek,
      workingTimeRuleDailyHoursDay: caps.dailyHoursDay,
      workingTimeRuleDailyHoursNight: caps.dailyHoursNight,
      workingTimeRuleDailyHoursMixed: caps.dailyHoursMixed,
      workingTimeRuleWorkDaysPerRestDay: caps.workDaysPerRestDay,
    }
  }
}
