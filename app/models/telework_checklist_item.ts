import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Punto (reactivo) del catálogo global de la lista de verificación de
 * teletrabajo (VLRH-H1790812613870).
 *
 * Modelo sin mixin de tenant: el catálogo es global y compartido por todas las
 * empresas. Sin soft delete: un punto no se borra, se desactiva cambiando
 * `teleworkChecklistItemIsActive`.
 */
export default class TeleworkChecklistItem extends BaseModel {
  static table = 'telework_checklist_items'

  @column({ isPrimary: true })
  declare teleworkChecklistItemId: number

  /** Código por concepto, sin numeral (p. ej. `iluminacion`). Único. */
  @column()
  declare teleworkChecklistItemCode: string

  /** Clave de traducción en `resources/lang` (`telework_checklist.items.<code>`). */
  @column()
  declare teleworkChecklistItemLabelKey: string

  /** Orden de presentación del punto en la lista. */
  @column()
  declare teleworkChecklistItemOrder: number

  /** Indica si el punto está activo y disponible para nuevas aplicaciones. */
  @column({
    consume: (value: unknown) => Boolean(value),
  })
  declare teleworkChecklistItemIsActive: boolean

  @column.dateTime({ autoCreate: true })
  declare teleworkChecklistItemCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare teleworkChecklistItemUpdatedAt: DateTime
}
