import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * Biometrico custodiado de un colaborador (spec ADMS 7.1).
 *
 * `biometricTemplateTemplate` es el dato biometrico en si: va cifrado en
 * reposo, NUNCA se serializa y ninguna ruta HTTP lo devuelve. La unica forma
 * de leerlo es `TemplateService.readForReplication`, que exige sesion y asienta
 * el acceso en la bitacora de datos sensibles.
 */
export default class BiometricTemplate extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'biometric_templates'

  @column({ isPrimary: true })
  declare biometricTemplateId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  /** `1` huella, `9` rostro, `8` palma. Es el `Type=` que declara el equipo. */
  @column()
  declare biometricTemplateBioType: number

  /** Numero de dedo o de plantilla dentro de la modalidad. */
  @column()
  declare biometricTemplateBioNo: number

  @column()
  declare biometricTemplateBioIndex: number

  @column()
  declare biometricTemplateBioFormat: number

  /** Version del ALGORITMO que produjo este blob, no la del equipo actual. */
  @column()
  declare biometricTemplateMajorVer: string | null

  @column()
  declare biometricTemplateMinorVer: string | null

  @column()
  declare biometricTemplateValid: number

  @column()
  declare biometricTemplateDuress: number

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
  declare biometricTemplateTemplate: string | null

  @column()
  declare biometricTemplateSize: number

  @column()
  declare sourceAccessPointId: number | null

  @column.dateTime()
  declare biometricTemplateCapturedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare biometricTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare biometricTemplateUpdatedAt: DateTime
}
