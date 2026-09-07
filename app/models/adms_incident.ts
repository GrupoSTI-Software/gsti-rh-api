import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { AdmsIncidentKind, AdmsIncidentSeverity } from '#modules/adms/adms.constants'

/**
 * Contexto del incidente: lista blanca cerrada, sin PII ni templates (spec 13,
 * regla 11). Sin firma de indice a proposito: con ella `keyof` se degrada a
 * `string`, la lista blanca del servicio deja de estar tipada y un typo se
 * descarta en silencio.
 */
export interface AdmsIncidentContext {
  serial?: string
  pin?: string
  ip?: string
  table?: string
  returnCode?: number
  bytes?: number
  lines?: number
  platform?: string
  previousIp?: string
  at?: string
}

/** Claves permitidas, derivadas del tipo: agregar una obliga a tocar la interfaz. */
export type AdmsIncidentContextKey = keyof AdmsIncidentContext

/**
 * Incidente consultable del canal ADMS (spec v2, 10). `businessUnitId` NULL es
 * global (serie desconocida, sondeo) y solo lo ve plataforma.
 */
export default class AdmsIncident extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'adms_incidents'

  @column({ isPrimary: true })
  declare admsIncidentId: number

  @column()
  declare accessPointId: number | null

  @column()
  declare businessUnitId: number | null

  @column()
  declare admsRawMessageId: number | null

  @column()
  declare deviceCommandId: number | null

  @column()
  declare admsIncidentKind: AdmsIncidentKind

  @column()
  declare admsIncidentSeverity: AdmsIncidentSeverity

  @column()
  declare admsIncidentCode: string

  @column()
  declare admsIncidentTitle: string

  @column()
  declare admsIncidentDetail: string

  @column()
  declare admsIncidentKey: string

  @column({
    prepare: (value: AdmsIncidentContext | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | AdmsIncidentContext | null) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return JSON.parse(value) as AdmsIncidentContext
      return value
    },
  })
  declare admsIncidentContext: AdmsIncidentContext | null

  @column()
  declare admsIncidentStatus: 'open' | 'resolved'

  @column.dateTime()
  declare admsIncidentResolvedAt: DateTime | null

  @column()
  declare admsIncidentResolvedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare admsIncidentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsIncidentUpdatedAt: DateTime
}
