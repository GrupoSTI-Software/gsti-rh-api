import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import OnboardingUserState from '#models/onboarding_user_state'
import type { OnboardingSeededEntityType } from '#modules/onboarding/onboarding.constants'

/**
 * Registro pieza por pieza de la siembra demo del onboarding
 * (USRH1785438246847). El borrado posterior (USRH1785438246903) borra lo
 * registrado aquí validando el snapshot `businessUnitId` fila a fila.
 * Sin soft delete: la fila muere junto con su entidad.
 */
export default class OnboardingSeededRecord extends BaseModel {
  static table = 'onboarding_seeded_records'

  @column({ isPrimary: true })
  declare onboardingSeededRecordId: number

  @column()
  declare onboardingUserStateId: number

  /** Snapshot de la unidad de negocio de la siembra (doble condición del borrado). */
  @column()
  declare businessUnitId: number

  @column()
  declare onboardingSeededRecordEntityType: OnboardingSeededEntityType

  @column()
  declare onboardingSeededRecordEntityId: number

  @column.dateTime({ autoCreate: true, columnName: 'onboarding_seeded_record_created_at' })
  declare onboardingSeededRecordCreatedAt: DateTime

  @belongsTo(() => OnboardingUserState, { foreignKey: 'onboardingUserStateId' })
  declare userState: BelongsTo<typeof OnboardingUserState>
}
