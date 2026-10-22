import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import TeleworkPhotoNotice from '#models/telework_photo_notice'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'

/**
 * Acuse del aviso de privacidad (VLRH-H1791306079310, §10). Registro inmutable
 * espejo de `telework_policy_acknowledgement.ts`: sin `SoftDeletes` y sin
 * `updated_at` —una fila se inserta y no se corrige ni se elimina—, es la
 * evidencia de que el teletrabajador conoció el aviso de una versión concreta.
 *
 * Inmutable por convención del servicio: este módulo solo cuenta y consulta; el
 * INSERT lo hace la HU hermana `VLRH-H1791311160825` desde la app, con su
 * propio `employee_id` de sesión. `businessUnitId` se copia SIEMPRE del aviso
 * al insertar, nunca del payload (anti-IDOR).
 *
 * La tabla nace vacía y es lo que hace existir el conteo de acuses por versión
 * desde el primer día.
 */
export default class TeleworkPhotoNoticeAcknowledgement extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_photo_notice_acknowledgements'

  @column({ isPrimary: true })
  declare teleworkPhotoNoticeAcknowledgementId: number

  @column()
  declare teleworkPhotoNoticeId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  @column.dateTime()
  declare teleworkPhotoNoticeAcknowledgementAcknowledgedAt: DateTime

  /**
   * Dirección IP desde la que se acusó — cifrada AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI). Fallo-CERRADO: si el descifrado falla (APP_KEY
   * rotada, dato corrupto), responde `null`, NUNCA el ciphertext en crudo
   * (mismo patrón que `telework_policy_acknowledgement`). Nunca se usa en
   * WHERE SQL.
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
  declare teleworkPhotoNoticeAcknowledgementIp: string | null

  /** User-agent del dispositivo desde el que se acusó — mismo tratamiento cifrado fallo-cerrado. */
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
  declare teleworkPhotoNoticeAcknowledgementUserAgent: string | null

  @column.dateTime({
    autoCreate: true,
    columnName: 'telework_photo_notice_acknowledgement_created_at',
  })
  declare teleworkPhotoNoticeAcknowledgementCreatedAt: DateTime

  @belongsTo(() => TeleworkPhotoNotice, { foreignKey: 'teleworkPhotoNoticeId' })
  declare notice: BelongsTo<typeof TeleworkPhotoNotice>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
