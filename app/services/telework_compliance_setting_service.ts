import db from '@adonisjs/lucid/services/db'
import TeleworkComplianceSetting from '#models/telework_compliance_setting'
import {
  DAYS_PER_MONTH,
  MAX_ALLOWANCE,
  MAX_REVALIDATION_MONTHS,
  MIN_REVALIDATION_MONTHS,
  TELEWORK_COMPLIANCE_DEFAULTS,
} from '#constants/telework_compliance_setting'
import { TELEWORK_COMPLIANCE_SETTING_ERROR_CODES } from '#constants/telework_compliance_setting_error_codes'
import { TeleworkComplianceSettingServiceError } from '#exceptions/telework_compliance_setting_service_error'
import type {
  TeleworkComplianceSettingEffective,
  UpsertTeleworkComplianceSettingInput,
} from '../interfaces/telework_compliance_setting_interface.js'

/** Fila cruda de la lectura con `leftJoin` (columnas calificadas del join). */
interface TeleworkComplianceSettingRow {
  telework_compliance_setting_id: number
  telework_compliance_setting_revalidation_period_months: number
  telework_compliance_setting_expiration_notice_days: number
  telework_compliance_setting_electricity_allowance_default: string | null
  telework_compliance_setting_internet_allowance_default: string | null
  telework_compliance_setting_own_equipment_fee_default: string | null
  telework_compliance_setting_updated_at: Date | string
  person_firstname: string | null
  person_lastname: string | null
  person_second_lastname: string | null
}

/** Campos de monto validados (R3), en el orden fijo de reporte de CA-8. */
const ALLOWANCE_FIELDS: ReadonlyArray<keyof UpsertTeleworkComplianceSettingInput> = [
  'electricityAllowanceDefault',
  'internetAllowanceDefault',
  'ownEquipmentFeeDefault',
]

/**
 * Servicio de dominio de los ajustes de teletrabajo por empresa
 * (VLRH-H1791306074375).
 *
 * Dos modos:
 *  - `getEffective`: lectura sin contexto HTTP (lo consume un cron), por
 *    `db.from` con filtro explícito, nunca por el modelo/mixin (CA-10/CA-11).
 *  - `upsert`: escritura con candado (`forUpdate` sobre `business_units`) para
 *    cerrar la carrera de alta; valida todo antes de abrir la transacción (R6).
 *
 * El servicio NO verifica permisos de BO: el `businessUnitId` llega ya
 * escopeado por el consumidor (garantía §9.5).
 */
export default class TeleworkComplianceSettingService {
  /**
   * Devuelve los ajustes efectivos de la empresa. Sin fila responde el default
   * virtual (12/30/`null`×3, `isDefault: true`) sin crear nada ni validar que la
   * empresa exista. Corre sin `TenantContext` ni `HttpContext` (CA-10).
   */
  async getEffective(businessUnitId: number): Promise<TeleworkComplianceSettingEffective> {
    this.assertScopeResolved(businessUnitId)

    // Una sola consulta, sin modelo ni mixin: el mixin lanzaría
    // TenantContextMissingException fuera de HTTP (lo leerá un cron).
    const row = (await db
      .from('telework_compliance_settings')
      .leftJoin(
        'users',
        'users.user_id',
        'telework_compliance_settings.telework_compliance_setting_updated_by_user_id'
      )
      .leftJoin('people', 'people.person_id', 'users.person_id')
      .where('telework_compliance_settings.business_unit_id', businessUnitId)
      .first()) as TeleworkComplianceSettingRow | null

    if (!row) {
      return {
        ...TELEWORK_COMPLIANCE_DEFAULTS,
        isDefault: true,
        teleworkComplianceSettingId: null,
        updatedAt: null,
        updatedByName: null,
      }
    }

    return {
      isDefault: false,
      teleworkComplianceSettingId: Number(row.telework_compliance_setting_id),
      revalidationPeriodMonths: Number(row.telework_compliance_setting_revalidation_period_months),
      expirationNoticeDays: Number(row.telework_compliance_setting_expiration_notice_days),
      electricityAllowanceDefault: this.toAmount(
        row.telework_compliance_setting_electricity_allowance_default
      ),
      internetAllowanceDefault: this.toAmount(
        row.telework_compliance_setting_internet_allowance_default
      ),
      ownEquipmentFeeDefault: this.toAmount(
        row.telework_compliance_setting_own_equipment_fee_default
      ),
      updatedAt: this.toIsoTimestamp(row.telework_compliance_setting_updated_at),
      updatedByName: this.buildFullName(
        row.person_firstname,
        row.person_lastname,
        row.person_second_lastname
      ),
    }
  }

  /**
   * Alta o edición idempotente de los ajustes de la empresa. Valida las reglas
   * R3-R5 (orden fijo de CA-8) antes de abrir la transacción; toma `forUpdate`
   * sobre la fila de `business_units` para serializar la carrera de alta; y al
   * salir devuelve el contrato completo vía `getEffective`.
   */
  async upsert(
    input: UpsertTeleworkComplianceSettingInput,
    businessUnitId: number,
    actorUserId: number
  ): Promise<TeleworkComplianceSettingEffective> {
    this.assertScopeResolved(businessUnitId)
    this.validateValues(input)

    const values = {
      teleworkComplianceSettingRevalidationPeriodMonths: input.revalidationPeriodMonths,
      teleworkComplianceSettingExpirationNoticeDays: input.expirationNoticeDays,
      teleworkComplianceSettingElectricityAllowanceDefault: input.electricityAllowanceDefault,
      teleworkComplianceSettingInternetAllowanceDefault: input.internetAllowanceDefault,
      teleworkComplianceSettingOwnEquipmentFeeDefault: input.ownEquipmentFeeDefault,
      teleworkComplianceSettingUpdatedByUserId: actorUserId,
    }

    await db.transaction(async (trx) => {
      // Candado de la carrera de alta (CA-13): dos altas simultáneas se
      // serializan; la segunda ve la fila recién creada y edita en vez de duplicar.
      await trx
        .from('business_units')
        .where('business_unit_id', businessUnitId)
        .forUpdate()
        .first()

      const existing = await TeleworkComplianceSetting.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .first()

      if (existing) {
        existing.merge(values)
        await existing.useTransaction(trx).save()
      } else {
        await TeleworkComplianceSetting.create(
          {
            businessUnitId,
            teleworkComplianceSettingCreatedByUserId: actorUserId,
            ...values,
          },
          { client: trx }
        )
      }
    })

    return this.getEffective(businessUnitId)
  }

  /** Falla cerrado si el alcance de empresa no está resuelto (403). */
  private assertScopeResolved(businessUnitId: number): void {
    if (!Number.isInteger(businessUnitId) || businessUnitId <= 0) {
      throw TeleworkComplianceSettingServiceError.withMessageKey(
        'telework_settings.forbidden_scope',
        TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.UNRESOLVED_SCOPE,
        403,
        'alcance-no-resuelto'
      )
    }
  }

  /**
   * Valida las reglas R4 → R5 → R3, en el orden fijo de reporte (CA-8): el
   * primer campo inválido gana. Nada se escribe si algo falla (R6).
   */
  private validateValues(input: UpsertTeleworkComplianceSettingInput): void {
    if (
      !Number.isInteger(input.revalidationPeriodMonths) ||
      input.revalidationPeriodMonths < MIN_REVALIDATION_MONTHS ||
      input.revalidationPeriodMonths > MAX_REVALIDATION_MONTHS
    ) {
      throw TeleworkComplianceSettingServiceError.withField(
        'telework_settings.invalid_revalidation',
        TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_REVALIDATION_MONTHS,
        'periodicidad-de-revalidacion-invalida',
        'revalidationPeriodMonths'
      )
    }

    const maxNoticeDays = input.revalidationPeriodMonths * DAYS_PER_MONTH
    if (
      !Number.isInteger(input.expirationNoticeDays) ||
      input.expirationNoticeDays < 1 ||
      input.expirationNoticeDays >= maxNoticeDays
    ) {
      throw TeleworkComplianceSettingServiceError.withField(
        'telework_settings.invalid_notice',
        TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_NOTICE_DAYS,
        'ventana-de-aviso-invalida',
        'expirationNoticeDays'
      )
    }

    for (const field of ALLOWANCE_FIELDS) {
      const value = input[field]
      if (value === null) continue
      if (this.isInvalidAmount(value)) {
        throw TeleworkComplianceSettingServiceError.withField(
          'telework_settings.invalid_allowance',
          TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_ALLOWANCE,
          'monto-invalido',
          field
        )
      }
    }
  }

  /** R3: monto finito, ≥ 0, ≤ tope y con dos decimales como máximo. */
  private isInvalidAmount(value: number): boolean {
    if (!Number.isFinite(value) || value < 0 || value > MAX_ALLOWANCE) return true
    return Math.abs(value * 100 - Math.round(value * 100)) >= 1e-6
  }

  /** MySQL devuelve `decimal` como texto: se conserva `null` (nunca `?? 0`). */
  private toAmount(value: string | null): number | null {
    return value === null ? null : Number(value)
  }

  /** Normaliza la fecha de última modificación a ISO 8601. */
  private toIsoTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  }

  /** Arma "{nombre} {apellido}[ {segundo apellido}]" sin espacio sobrante. */
  private buildFullName(
    firstname: string | null,
    lastname: string | null,
    secondLastname: string | null
  ): string {
    return [firstname, lastname, secondLastname]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ')
  }
}
