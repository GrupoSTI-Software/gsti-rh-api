import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * Ajustes de teletrabajo por empresa (VLRH-H1791306074375).
 *
 * Una fila por business unit con los montos por defecto de luz, internet y
 * cuota por equipo propio (decimal(10,2), `null` = sin monto propuesto), la
 * periodicidad de revalidación (meses) y la ventana de aviso (días). Sin soft
 * delete: la configuración se edita en sitio.
 *
 * Compone `withBusinessUnitScope()` como defensa en profundidad (una fila por
 * empresa). La lectura fuera de HTTP (`getEffective`) NO usa este modelo: el
 * mixin lanza `TenantContextMissingException` sin contexto; el servicio consulta
 * por `db.from` con filtro explícito (CA-11).
 */
export default class TeleworkComplianceSetting extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_compliance_settings'

  @column({ isPrimary: true })
  declare teleworkComplianceSettingId: number

  @column({ serializeAs: null })
  declare businessUnitId: number

  @column()
  declare teleworkComplianceSettingRevalidationPeriodMonths: number

  @column()
  declare teleworkComplianceSettingExpirationNoticeDays: number

  @column({ consume: (value: string | null) => (value === null ? null : Number(value)) })
  declare teleworkComplianceSettingElectricityAllowanceDefault: number | null

  @column({ consume: (value: string | null) => (value === null ? null : Number(value)) })
  declare teleworkComplianceSettingInternetAllowanceDefault: number | null

  @column({ consume: (value: string | null) => (value === null ? null : Number(value)) })
  declare teleworkComplianceSettingOwnEquipmentFeeDefault: number | null

  @column({ serializeAs: null })
  declare teleworkComplianceSettingCreatedByUserId: number

  @column()
  declare teleworkComplianceSettingUpdatedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare teleworkComplianceSettingCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare teleworkComplianceSettingUpdatedAt: DateTime

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, { foreignKey: 'teleworkComplianceSettingCreatedByUserId' })
  declare creator: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'teleworkComplianceSettingUpdatedByUserId' })
  declare lastEditor: BelongsTo<typeof User>
}
