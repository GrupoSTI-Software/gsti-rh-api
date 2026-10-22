import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Plantilla base global del aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310, §10). Espejo de
 * `telework_policy_template.ts`: documento de plataforma mantenido por GSTI
 * (sembrado, sin pantalla de administración), sin `business_unit_id`, sin
 * SoftDeletes y **sin** mixin de empresa —su lectura no depende de la empresa
 * activa, así que no exige `TenantContext`—.
 *
 * El texto legal es DATO de la plantilla, no código: `…TemplateContent`
 * conserva los marcadores de la lista cerrada (`TELEWORK_PHOTO_NOTICE_
 * PLACEHOLDERS`) y se sirve sin resolver. La sustitución con el valor de la
 * empresa ocurre al publicar el aviso, en el servicio.
 */
export default class TeleworkPhotoNoticeTemplate extends BaseModel {
  static table = 'telework_photo_notice_templates'

  @column({ isPrimary: true })
  declare teleworkPhotoNoticeTemplateId: number

  @column()
  declare teleworkPhotoNoticeTemplateVersion: string

  @column()
  declare teleworkPhotoNoticeTemplateTitle: string

  @column()
  declare teleworkPhotoNoticeTemplateContent: string

  @column({
    consume: (value: boolean | number) => Boolean(value),
  })
  declare teleworkPhotoNoticeTemplateIsCurrent: boolean

  @column.dateTime({ autoCreate: true })
  declare teleworkPhotoNoticeTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare teleworkPhotoNoticeTemplateUpdatedAt: DateTime | null
}
