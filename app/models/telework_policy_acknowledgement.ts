import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import TeleworkPolicy from '#models/telework_policy'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'

/**
 * Acuse de la Política de Teletrabajo (NOM-037-STPS-2023, numeral 5.2,
 * USRH1783547655377). Registro inmutable espejo de `user_consent.ts`: es la
 * evidencia central que acepta la STPS de que el teletrabajador conoció y
 * aceptó una versión concreta de la política.
 *
 * Inmutable por convención de service: esta HU solo lee (seguimiento); el
 * INSERT lo hace la HU hermana ESB-08-07-02-03 desde la app del
 * teletrabajador, con su propio `employee_id` de sesión. Sin `SoftDeletes` y
 * sin método de update/delete en el repositorio — sin método = sin
 * superficie. `business_unit_id` se copia SIEMPRE de `policy.businessUnitId`
 * al insertar, nunca del payload (anti-IDOR).
 */
export default class TeleworkPolicyAcknowledgement extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_policy_acknowledgements'

  @column({ isPrimary: true })
  declare teleworkPolicyAcknowledgementId: number

  @column()
  declare teleworkPolicyId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  @column.dateTime()
  declare teleworkPolicyAcknowledgementAcknowledgedAt: DateTime

  /**
   * Dirección IP desde la que se firmó — cifrada AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI). Fallo-CERRADO: si el descifrado falla (APP_KEY
   * rotada, dato corrupto), responde `null`, NUNCA el ciphertext en crudo
   * (mismo patrón que `user_consent.ts`). Nunca se usa en WHERE SQL.
   */
  @column({
    serializeAs: null,
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
  })
  declare teleworkPolicyAcknowledgementIp: string | null

  /** User-agent del dispositivo desde el que se firmó — mismo tratamiento cifrado fallo-cerrado. */
  @column({
    serializeAs: null,
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
  })
  declare teleworkPolicyAcknowledgementUserAgent: string | null

  /**
   * Key relativa de S3 (ACL private) de la firma canvas en PNG. Nullable
   * desde ya: la puebla la HU hermana ESB-08-07-02-03 al firmar (subida con
   * `uploadPrivateBuffer`, lectura solo vía `getDownloadLink` presigned).
   */
  @column()
  declare teleworkPolicyAcknowledgementSignatureFilePath: string | null

  @column.dateTime({
    autoCreate: true,
    columnName: 'telework_policy_acknowledgement_created_at',
  })
  declare teleworkPolicyAcknowledgementCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'telework_policy_acknowledgement_updated_at',
  })
  declare teleworkPolicyAcknowledgementUpdatedAt: DateTime | null

  @belongsTo(() => TeleworkPolicy, { foreignKey: 'teleworkPolicyId' })
  declare policy: BelongsTo<typeof TeleworkPolicy>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
