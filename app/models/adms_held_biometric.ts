import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

export type AdmsHeldBiometricStatus = 'held' | 'attributed' | 'discarded'

/**
 * Biometrico que llego de un PIN sin dueno (spec ADMS 9.4).
 *
 * No se descarta: el equipo ya le tomo el dedo a una persona real y volver a
 * pedirselo cuesta una visita. Espera aqui a que alguien concilie el PIN.
 */
export default class AdmsHeldBiometric extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'adms_held_biometrics'

  @column({ isPrimary: true })
  declare admsHeldBiometricId: number

  @column()
  declare admsUnmappedPinId: number | null

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare admsHeldBiometricPin: string

  @column()
  declare admsHeldBiometricBioType: number

  @column()
  declare admsHeldBiometricBioNo: number

  @column()
  declare admsHeldBiometricMajorVer: string | null

  @column()
  declare admsHeldBiometricMinorVer: string | null

  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serializeAs: null,
  })
  declare admsHeldBiometricTemplate: string | null

  @column()
  declare admsHeldBiometricSize: number

  @column()
  declare admsHeldBiometricStatus: AdmsHeldBiometricStatus

  @column()
  declare biometricTemplateId: number | null

  @column.dateTime({ autoCreate: true })
  declare admsHeldBiometricCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsHeldBiometricUpdatedAt: DateTime
}
