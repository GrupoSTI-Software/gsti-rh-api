import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import SystemSettingsEmployee from './system_settings_employee.js'
import SystemSettingPayrollConfig from './system_setting_payroll_config.js'
import Tolerance from './tolerance.js'
import SystemSettingProceedingFile from './system_setting_proceeding_file.js'
import BusinessUnit from './business_unit.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      SystemSetting:
 *        type: object
 *        properties:
 *          systemSettingId:
 *            type: number
 *            description: System setting id
 *          systemSettingTradeName:
 *            type: string
 *            description: System setting trade name
 *          systemSettingLogo:
 *            type: string
 *            description: System setting logo
 *          systemSettingBanner:
 *            type: string
 *            description: System setting banner
 *          systemSettingFavicon:
 *            type: string
 *            description: System setting favicon
 *          systemSettingEmployeeAplicationIcon:
 *            type: string
 *            description: System setting employee application icon (512x512 PNG)
 *          systemSettingSidebarColor:
 *            type: string
 *            description: System setting sidebar color
 *          systemSettingBusinessUnits:
 *            type: string
 *            description: Available business Units
 *          businessUnitId:
 *            type: number
 *            nullable: true
 *            description: Relación formal por identificador hacia la unidad de negocio (tenant) dueña de esta configuración. Nulo en el registro base fundacional (id 1); poblado en los registros creados por el alta self-service (USRH1783712837572).
 *          systemSettingToleranceCountPerAbsence:
 *            type: number
 *            description: System setting tolerance count per absence
 *          systemSettingActive:
 *            type: number
 *            description: System setting status
 *          systemSettingRestrictFutureVacation:
 *            type: number
 *            description: System setting restrict future vacations
 *          systemSettingBirthdayEmails:
 *            type: number
 *            description: System setting birthday emails status to activate or deactivate the birthday emails from the command "birth_day_email" by default is false as 0
 *          systemSettingAnniversaryEmails:
 *            type: number
 *            description: System setting anniversary emails status to activate or deactivate the anniversary emails from the command "anniversary_email" by default is false as 0
 *          systemSettingAttendanceFaultHrEmails:
 *            type: number
 *            description: Activa o desactiva el envío de correos a RH por falta de registro de asistencia tras la tolerancia Fault (comando notify:attendance-fault-hr)
 *          systemSettingMaxAbsencesBeforeAttendanceLock:
 *            type: number
 *            description: System setting max absences before attendance lock
 *          systemSettingMaxLateArrivalsBeforeAttendanceLock:
 *            type: number
 *            description: System setting max late arrivals before attendance lock
 *          systemSettingPeriodAbsencesBeforeAttendanceLock:
 *            type: string
 *            description: System setting period absences before attendance lock
 *          systemSettingMonthlyConversionFactor:
 *            type: number
 *            description: Factor días/mes para convertir salario diario a mensual en UI (default 30.4, consistente con IMSS). Solo para display, no afecta cálculos de negocio.
 *          systemSettingUpdatedAt:
 *            type: string
 *          systemSettingDeletedAt:
 *            type: string
 *
 */
export default class SystemSetting extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare systemSettingId: number

  @column()
  declare systemSettingTradeName: string

  @column()
  declare systemSettingLogo: string | null

  @column()
  declare systemSettingBanner: string | null

  @column()
  declare systemSettingSidebarColor: string

  @column()
  declare systemSettingFavicon: string | null

  @column()
  declare systemSettingEmployeeAplicationIcon: string | null

  @column()
  declare systemSettingActive: number

  @column()
  declare systemSettingBusinessUnits: string

  /**
   * Relación formal por identificador hacia la unidad de negocio (tenant) dueña de
   * esta configuración (USRH1783712837572). Nulo en el registro base fundacional
   * (`system_setting_id = 1`), que no representa un tenant real.
   */
  @column()
  declare businessUnitId: number | null

  @column()
  declare systemSettingToleranceCountPerAbsence: number

  @column()
  declare systemSettingRestrictFutureVacation: number

  @column()
  declare systemSettingBirthdayEmails: number | 0 // 0 for false, 1 for true

  @column()
  declare systemSettingAnniversaryEmails: number | 0 // 0 for false, 1 for true

  @column()
  declare systemSettingAttendanceFaultHrEmails: number | 0

  @column()
  declare systemSettingMaxAbsencesBeforeAttendanceLock: number | null

  @column()
  declare systemSettingMaxLateArrivalsBeforeAttendanceLock: number | null

  @column()
  declare systemSettingPeriodAbsencesBeforeAttendanceLock: string

  @column()
  declare systemSettingPeriodLateArrivalsBeforeAttendanceLock: string

  @column()
  declare systemSettingMonthlyConversionFactor: number

  @column.dateTime({ autoCreate: true })
  declare systemSettingCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare systemSettingUpdatedAt: DateTime

  @column.dateTime({ columnName: 'system_setting_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => SystemSettingsEmployee, {
    foreignKey: 'systemSettingId',
  })

  declare systemSettingsEmployees: HasMany<typeof SystemSettingsEmployee>
  @hasMany(() => SystemSettingPayrollConfig, {
    foreignKey: 'systemSettingId',
  })
  declare systemSettingPayrollConfigs: HasMany<typeof SystemSettingPayrollConfig>

  @hasMany(() => Tolerance, {
    foreignKey: 'systemSettingId',
  })
  declare systemSettingTolerances: HasMany<typeof Tolerance>

  @hasMany(() => SystemSettingProceedingFile, {
    foreignKey: 'systemSettingId',
  })
  declare systemSettingProceedingFiles: HasMany<typeof SystemSettingProceedingFile>

  /**
   * Unidad de negocio (tenant) dueña de esta configuración, por relación formal.
   * No se aplica `withBusinessUnitScope()` a este modelo: los 27 consumidores
   * legacy de `SystemSettingService.getActive()` siguen resolviendo por
   * `system_setting_business_units` (FIND_IN_SET) hasta que las HUs 3 y 4 del
   * set los migren; aplicar el scope aquí cambiaría ese comportamiento en silencio.
   */
  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
