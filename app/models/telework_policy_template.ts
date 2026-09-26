import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Un componente del numeral 5.2 (incisos a-l). `key`/`clause`/`required`/`order` son estructura fija. */
export interface TeleworkPolicyComponent {
  key: string
  clause: string
  title: string
  body: string
  required: boolean
  order: number
}

/**
 * Plantilla base global de la Política de Teletrabajo (NOM-037, numeral 5.2).
 *
 * Documento de plataforma mantenido por GSTI (sembrado, sin pantalla de
 * administración): sin `business_unit_id`, sin SoftDeletes. Espejo de
 * `legal_document.ts` pero de una sola tabla/fila vigente (no hay historial
 * de versiones de la plantilla en esta HU).
 */
export default class TeleworkPolicyTemplate extends BaseModel {
  static table = 'telework_policy_templates'

  @column({ isPrimary: true })
  declare teleworkPolicyTemplateId: number

  @column()
  declare teleworkPolicyTemplateVersion: string

  @column({
    prepare: (value: TeleworkPolicyComponent[]) => JSON.stringify(value),
    consume: (value: string | TeleworkPolicyComponent[]) =>
      typeof value === 'string' ? (JSON.parse(value) as TeleworkPolicyComponent[]) : value,
  })
  declare teleworkPolicyTemplateComponents: TeleworkPolicyComponent[]

  @column({
    prepare: (value: boolean) => value,
    consume: (value: boolean | number) => Boolean(value),
  })
  declare teleworkPolicyTemplateIsCurrent: boolean

  @column.dateTime({ autoCreate: true })
  declare teleworkPolicyTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare teleworkPolicyTemplateUpdatedAt: DateTime | null
}
