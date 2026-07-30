import SystemSetting from '#models/system_setting'
import SystemSettingPayrollConfig from '#models/system_setting_payroll_config'
import BusinessUnit from '#models/business_unit'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SignupServiceError } from '../exceptions/signup_service_error.js'
import { SIGNUP_ERROR_CODES } from '../constants/signup_error_codes.js'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import { SYSTEM_SETTING_RESOLUTION_ERROR_CODES } from '../constants/system_setting_resolution_error_codes.js'

/**
 * Id del registro base fundacional de `system_settings` (siembra
 * `0019_system_setting_seeder.ts`), fuente de la copia de contenido para la
 * configuración de cada tenant nuevo (USRH1783712837572).
 */
const BASE_SYSTEM_SETTING_ID = 1

/**
 * Columnas de contenido que se copian del registro base al crear la
 * configuración de un tenant nuevo. Excluye `systemSettingId`, timestamps,
 * `deletedAt`, `businessUnitId` y `systemSettingBusinessUnits` (estas dos
 * últimas se resuelven para el tenant destino, no se copian del base).
 */
function cloneBaseContent(base: SystemSetting) {
  return {
    systemSettingTradeName: base.systemSettingTradeName,
    systemSettingLogo: base.systemSettingLogo,
    systemSettingBanner: base.systemSettingBanner,
    systemSettingSidebarColor: base.systemSettingSidebarColor,
    systemSettingFavicon: base.systemSettingFavicon,
    systemSettingEmployeeAplicationIcon: base.systemSettingEmployeeAplicationIcon,
    systemSettingActive: base.systemSettingActive,
    systemSettingToleranceCountPerAbsence: base.systemSettingToleranceCountPerAbsence,
    systemSettingRestrictFutureVacation: base.systemSettingRestrictFutureVacation,
    systemSettingBirthdayEmails: base.systemSettingBirthdayEmails,
    systemSettingAnniversaryEmails: base.systemSettingAnniversaryEmails,
    systemSettingAttendanceFaultHrEmails: base.systemSettingAttendanceFaultHrEmails,
    systemSettingMaxAbsencesBeforeAttendanceLock: base.systemSettingMaxAbsencesBeforeAttendanceLock,
    systemSettingMaxLateArrivalsBeforeAttendanceLock: base.systemSettingMaxLateArrivalsBeforeAttendanceLock,
    systemSettingPeriodAbsencesBeforeAttendanceLock: base.systemSettingPeriodAbsencesBeforeAttendanceLock,
    systemSettingPeriodLateArrivalsBeforeAttendanceLock:
      base.systemSettingPeriodLateArrivalsBeforeAttendanceLock,
    systemSettingMonthlyConversionFactor: base.systemSettingMonthlyConversionFactor,
  }
}

export default class SystemSettingService {
  /**
   * USRH1783712837584: filtra por la relación formal `business_unit_id` en
   * vez de `FIND_IN_SET` sobre el CSV de slugs. `businessUnitId` viene de
   * `ctx.businessUnitScope[0]` (middleware `businessScope`, siempre un único
   * id). Lista vacía (sin `businessUnitId`) no es un error: es el estado
   * "esta empresa aún no tiene configuración", que habilita el flujo "New"
   * existente en la pantalla BO — no lanza `resolveByBusinessUnitId`.
   */
  async index(businessUnitId?: number) {
    const systemSettingsList = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .preload('systemSettingPayrollConfigs')
      .if(!businessUnitId, (query) => query.whereRaw('1 = 0'))
      .if(!!businessUnitId, (query) => query.where('business_unit_id', businessUnitId!))

    return { data: systemSettingsList }
  }

  async create(systemSetting: SystemSetting) {
    const newSystemSetting = new SystemSetting()
    newSystemSetting.businessUnitId = systemSetting.businessUnitId
    newSystemSetting.systemSettingTradeName = systemSetting.systemSettingTradeName
    newSystemSetting.systemSettingSidebarColor = systemSetting.systemSettingSidebarColor
    newSystemSetting.systemSettingLogo = systemSetting.systemSettingLogo
    newSystemSetting.systemSettingBanner = systemSetting.systemSettingBanner
    newSystemSetting.systemSettingFavicon = systemSetting.systemSettingFavicon
    newSystemSetting.systemSettingActive = systemSetting.systemSettingActive
    newSystemSetting.systemSettingBusinessUnits = systemSetting.systemSettingBusinessUnits
    newSystemSetting.systemSettingToleranceCountPerAbsence = systemSetting.systemSettingToleranceCountPerAbsence
    newSystemSetting.systemSettingRestrictFutureVacation = systemSetting.systemSettingRestrictFutureVacation
    newSystemSetting.systemSettingMaxAbsencesBeforeAttendanceLock = systemSetting.systemSettingMaxAbsencesBeforeAttendanceLock
    newSystemSetting.systemSettingMaxLateArrivalsBeforeAttendanceLock = systemSetting.systemSettingMaxLateArrivalsBeforeAttendanceLock
    newSystemSetting.systemSettingPeriodAbsencesBeforeAttendanceLock = systemSetting.systemSettingPeriodAbsencesBeforeAttendanceLock
    newSystemSetting.systemSettingPeriodLateArrivalsBeforeAttendanceLock = systemSetting.systemSettingPeriodLateArrivalsBeforeAttendanceLock
    newSystemSetting.systemSettingMonthlyConversionFactor =
      systemSetting.systemSettingMonthlyConversionFactor ?? 30.4
    await newSystemSetting.save()
    return newSystemSetting
  }

  async update(currentSystemSetting: SystemSetting, systemSetting: SystemSetting) {
    currentSystemSetting.systemSettingTradeName = systemSetting.systemSettingTradeName
    currentSystemSetting.systemSettingSidebarColor = systemSetting.systemSettingSidebarColor
    currentSystemSetting.systemSettingLogo = systemSetting.systemSettingLogo
    currentSystemSetting.systemSettingBanner = systemSetting.systemSettingBanner
    currentSystemSetting.systemSettingFavicon = systemSetting.systemSettingFavicon
    currentSystemSetting.systemSettingActive = systemSetting.systemSettingActive
    currentSystemSetting.systemSettingToleranceCountPerAbsence = systemSetting.systemSettingToleranceCountPerAbsence
    currentSystemSetting.systemSettingRestrictFutureVacation = systemSetting.systemSettingRestrictFutureVacation
    currentSystemSetting.systemSettingMaxAbsencesBeforeAttendanceLock = systemSetting.systemSettingMaxAbsencesBeforeAttendanceLock
    currentSystemSetting.systemSettingMaxLateArrivalsBeforeAttendanceLock = systemSetting.systemSettingMaxLateArrivalsBeforeAttendanceLock
    currentSystemSetting.systemSettingPeriodAbsencesBeforeAttendanceLock = systemSetting.systemSettingPeriodAbsencesBeforeAttendanceLock
    currentSystemSetting.systemSettingPeriodLateArrivalsBeforeAttendanceLock = systemSetting.systemSettingPeriodLateArrivalsBeforeAttendanceLock
    currentSystemSetting.systemSettingMonthlyConversionFactor =
      systemSetting.systemSettingMonthlyConversionFactor ?? currentSystemSetting.systemSettingMonthlyConversionFactor
    currentSystemSetting.systemSettingBusinessUnits = systemSetting.systemSettingBusinessUnits
    await currentSystemSetting.save()
    return currentSystemSetting
  }

  async delete(currentSystemSetting: SystemSetting) {
    await currentSystemSetting.delete()
    return currentSystemSetting
  }

  async show(systemSettingId: number) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .preload('systemSettingPayrollConfigs')
      .first()
    return systemSetting ? systemSetting : null
  }

  async getActive(allowedBusinessUnitSlugs: string[] = []) {
    let slugs = allowedBusinessUnitSlugs
    if (slugs.length === 0) {
      const allBus = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereNull('business_unit_deleted_at')
      slugs = allBus.map((bu) => bu.businessUnitSlug)
    }

    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .preload('systemSettingTolerances')
      .andWhere((query) => {
        query.andWhere((subQuery) => {
          slugs.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, system_setting_business_units)', [business.trim()])
          })
        })
      })
      .first()

    return systemSetting ?? null
  }

  /**
   * Localiza la configuración de UNA empresa por su relación formal
   * (`business_unit_id`, USRH1783712837572). Frontera de reúso única:
   * es el único punto que consulta `system_settings` por `business_unit_id`.
   *
   * Entrada plana (no recibe `ctx`, no lee header, no toca `TenantContext`):
   * resolver el identificador es responsabilidad del call-site. Esto permite
   * que la historia hermana batch (USRH1783713925140) reutilice este mismo
   * método pasando el tenant que obtenga de su propio contexto.
   *
   * Fail-closed estricto: sin registro propio para el id → error tipado
   * `SystemSettingResolutionError`. Nunca cae a "todas las unidades activas"
   * (patrón de `getActive()`) ni al registro base `system_setting_id = 1`.
   */
  async resolveByBusinessUnitId(businessUnitId: number): Promise<SystemSetting> {
    const systemSetting = await SystemSetting.query()
      .where('business_unit_id', businessUnitId)
      .where('system_setting_active', 1)
      .whereNull('system_setting_deleted_at')
      .preload('systemSettingTolerances')
      .first()

    if (!systemSetting) {
      throw new SystemSettingResolutionError(
        'La empresa no tiene una configuración de System Settings propia',
        SYSTEM_SETTING_RESOLUTION_ERROR_CODES.NOT_FOUND_TENANT,
        404,
        'configuracion-no-encontrada',
        'La empresa no tiene una configuración de System Settings propia.'
      )
    }

    return systemSetting
  }

  async getPayrollConfig(systemSettingId: number) {

    const today = DateTime.local().toFormat('yyyy-LL-dd')
    const systemSettingPayrollConfig = await SystemSettingPayrollConfig
      .query()
      .whereNull('system_setting_payroll_config_deleted_at')
      .where('system_setting_id', systemSettingId)
      .where('system_setting_payroll_config_apply_since', '<=', today)
      .orderBy('system_setting_payroll_config_apply_since', 'desc')
      .first()

    return systemSettingPayrollConfig
  }

  async verifyInfo(systemSetting: SystemSetting) {
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    const existTradeName = await SystemSetting.query()
      .if(systemSetting.systemSettingId > 0, (query) => {
        query.whereNot('system_setting_id', systemSetting.systemSettingId)
      })
      .whereNull('system_setting_deleted_at')
      .where('system_setting_trade_name', systemSetting.systemSettingTradeName)
      .first()

    if (existTradeName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The system setting trade name exists for another system setting',
        message: `The system setting resource cannot be ${action} because the system setting trade name is already assigned to another system setting`,
        data: { ...systemSetting },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  /**
   * USRH1783712837584: filtra por `business_unit_id` en vez de `FIND_IN_SET`.
   * Con el `UNIQUE(business_unit_id)` de la migración de la HU2, esto en la
   * práctica detecta "esta empresa ya tiene una fila" antes de que la BD
   * tire el constraint.
   */
  async verifyActiveStore(systemSetting: SystemSetting, businessUnitId?: number) {
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    if (systemSetting.systemSettingActive) {
      const activeItem = await SystemSetting.query()
        .where('system_setting_active', 1)
        .whereNull('system_setting_deleted_at')
        .if(!businessUnitId, (query) => query.whereRaw('1 = 0'))
        .if(!!businessUnitId, (query) => query.where('business_unit_id', businessUnitId!))
        .first()
      if (activeItem) {
        return {
          status: 400,
          type: 'warning',
          title: 'The system setting status',
          message: `The system setting resource cannot be ${action} because only one record can be active`,
          data: { ...systemSetting },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  /**
   * USRH1783712837584: filtra por `business_unit_id` en vez de `FIND_IN_SET`.
   */
  async verifyActiveUpdate(
    systemSetting: SystemSetting,
    currentSystemSetting: SystemSetting,
    businessUnitId?: number
  ) {
    const action = systemSetting.systemSettingId > 0 ? 'updated' : 'created'
    if (systemSetting.systemSettingId > 0) {
      if (systemSetting.systemSettingActive && !currentSystemSetting.systemSettingActive) {
        const activeItem = await SystemSetting.query()
          .where('system_setting_active', 1)
          .whereNull('system_setting_deleted_at')
          .if(!businessUnitId, (query) => query.whereRaw('1 = 0'))
          .if(!!businessUnitId, (query) => query.where('business_unit_id', businessUnitId!))
          .first()
        if (activeItem && activeItem.systemSettingId !== currentSystemSetting.systemSettingId) {
          return {
            status: 400,
            type: 'warning',
            title: 'The system setting status',
            message: `The system setting resource cannot be ${action} because only one record can be active`,
            data: { ...systemSetting },
          }
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...systemSetting },
    }
  }

  async updateBirthdayEmailsStatus(systemSettingId: number, birthdayEmailsEnabled: boolean) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'The system setting was not found with the entered ID',
        data: { systemSettingId },
      }
    }

    systemSetting.systemSettingBirthdayEmails = birthdayEmailsEnabled ? 1 : 0
    await systemSetting.save()

    return {
      status: 200,
      type: 'success',
      title: 'Birthday emails status updated',
      message: 'The birthday emails status was updated successfully',
      data: { systemSetting },
    }
  }

  async updateAttendanceFaultHrEmailsStatus(systemSettingId: number, enabled: boolean) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'The system setting was not found with the entered ID',
        data: { systemSettingId },
      }
    }

    systemSetting.systemSettingAttendanceFaultHrEmails = enabled ? 1 : 0
    await systemSetting.save()

    return {
      status: 200,
      type: 'success',
      title: 'Estado de notificaciones por falta de asistencia actualizado',
      message: 'La opción de correos a RH por falta de registro de asistencia se actualizó correctamente',
      data: { systemSetting },
    }
  }

  async updateAnniversaryEmailsStatus(systemSettingId: number, anniversaryEmailsEnabled: boolean) {
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      return {
        status: 404,
        type: 'warning',
        title: 'System setting not found',
        message: 'The system setting was not found with the entered ID',
        data: { systemSettingId },
      }
    }

    systemSetting.systemSettingAnniversaryEmails = anniversaryEmailsEnabled ? 1 : 0
    await systemSetting.save()

    return {
      status: 200,
      type: 'success',
      title: 'Anniversary emails status updated',
      message: 'The anniversary emails status was updated successfully',
      data: { systemSetting },
    }
  }

  /**
   * Crea (o revive) de forma idempotente el `system_settings` de un tenant
   * nuevo, copiando el contenido del registro base fundacional y ligándolo
   * por `business_unit_id` (relación formal, USRH1783712837572).
   *
   * Debe invocarse dentro de la transacción del alta self-service
   * (`SignupDraftService.complete()`): si falla, el llamador debe abortar
   * toda la transacción (fail-closed, sin fallback silencioso).
   *
   * Idempotencia por `business_unit_id`:
   * - Si ya existe un registro **activo** para ese tenant, se devuelve tal
   *   cual (un reintento del registro no duplica ni sobreescribe contenido).
   * - Si existe un registro **soft-deleted**, se revive (`restore()`) y se
   *   actualiza con el contenido vigente del base — decisión confirmada: un
   *   tenant puede reprovisionarse tras un soft-delete de su configuración.
   * - Si no existe, se crea copiando el contenido del registro base.
   *
   * `system_setting_business_units` también se puebla con el slug del tenant
   * nuevo (convivencia con los 27 consumidores legacy de `getActive()` que
   * hoy resuelven por `FIND_IN_SET`; migrarlos es trabajo de las HUs 3 y 4
   * del set, fuera de alcance aquí).
   */
  async createForTenant(
    businessUnitId: number,
    businessUnitSlug: string,
    trx: TransactionClientContract
  ): Promise<SystemSetting> {
    // El registro base es plantilla fundacional: se lee con withTrashed porque
    // un soft-delete accidental del id 1 no debe bloquear el alta de tenants
    // (el filtro SoftDeletes ocultaría la fila y fallaría con SGNP.SETTINGS.001).
    const base = await SystemSetting.query({ client: trx })
      .withTrashed()
      .where('system_setting_id', BASE_SYSTEM_SETTING_ID)
      .first()

    if (!base) {
      throw new SignupServiceError(
        'El registro base de system_settings (id 1) no existe; no es posible provisionar la configuración del tenant nuevo',
        SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED,
        500,
        'signup-settings-provisioning-failed',
        'No fue posible crear la configuración base de la empresa nueva'
      )
    }

    const content = cloneBaseContent(base)

    const existing = await SystemSetting.query({ client: trx })
      .withTrashed()
      .where('business_unit_id', businessUnitId)
      .first()

    if (existing) {
      if (!existing.deletedAt) {
        // Ya activo para este tenant: idempotente, no se reinserta ni se sobreescribe.
        return existing
      }

      existing.useTransaction(trx)
      Object.assign(existing, content)
      existing.systemSettingBusinessUnits = businessUnitSlug
      // `restore()` limpia `deletedAt` y persiste en una sola escritura
      // (incluye el contenido recién asignado, ya marcado como dirty).
      await existing.restore()
      return existing
    }

    const created = new SystemSetting()
    Object.assign(created, content)
    created.businessUnitId = businessUnitId
    created.systemSettingBusinessUnits = businessUnitSlug
    created.useTransaction(trx)
    await created.save()
    return created
  }
}
