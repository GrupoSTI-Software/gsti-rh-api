import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'

export type TeleworkPolicyStatus = 'draft' | 'published'

/**
 * Política de Teletrabajo por empresa (NOM-037, numeral 5.2), documento
 * versionable espejo de `legal_document.ts` + scope por empresa espejo de
 * `retention_policy.ts`. Cada fila es una versión; en esta HU solo se opera
 * el borrador (`teleworkPolicyStatus = 'draft'`).
 *
 * Sin `withBusinessUnitScope()` mixin: el filtro por `businessUnitId` se hace
 * explícito en el repository (igual que `retention_policy`), para controlar
 * con precisión "a lo sumo un borrador activo por empresa a la vez".
 */
export default class TeleworkPolicy extends compose(BaseModel, SoftDeletes) {
  static table = 'telework_policies'

  @column({ isPrimary: true })
  declare teleworkPolicyId: number

  @column()
  declare businessUnitId: number

  @column()
  declare teleworkPolicyVersion: number

  @column()
  declare teleworkPolicyTitle: string

  @column({
    prepare: (value: TeleworkPolicyComponent[]) => JSON.stringify(value),
    consume: (value: string | TeleworkPolicyComponent[]) =>
      typeof value === 'string' ? (JSON.parse(value) as TeleworkPolicyComponent[]) : value,
  })
  declare teleworkPolicyComponents: TeleworkPolicyComponent[]

  @column()
  declare teleworkPolicyStatus: TeleworkPolicyStatus

  @column({
    prepare: (value: boolean) => value,
    consume: (value: boolean | number) => Boolean(value),
  })
  declare teleworkPolicyIsCurrent: boolean

  @column()
  declare teleworkPolicyContentHash: string | null

  @column({ serializeAs: null })
  declare createdByUserId: number

  @column()
  declare updatedByUserId: number

  @column({ serializeAs: null })
  declare publishedByUserId: number | null

  @column.dateTime()
  declare publishedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'telework_policy_created_at' })
  declare teleworkPolicyCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'telework_policy_updated_at',
  })
  declare teleworkPolicyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'telework_policy_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, { foreignKey: 'createdByUserId' })
  declare creator: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'updatedByUserId' })
  declare lastEditor: BelongsTo<typeof User>
}
