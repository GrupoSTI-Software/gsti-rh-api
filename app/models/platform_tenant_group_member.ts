import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PlatformTenantGroup from './platform_tenant_group.js'
import BusinessUnit from './business_unit.js'

/**
 * Pertenencia de una cuenta a un grupo (USRH1788052455657).
 * Sin `SoftDeletes`: la membresía existe o no existe.
 */
export default class PlatformTenantGroupMember extends BaseModel {
  static readonly table = 'platform_tenant_group_members'

  @column({ isPrimary: true })
  declare platformTenantGroupMemberId: number

  @column()
  declare platformTenantGroupId: number

  /** Identificador interno; nunca se expone en respuestas (serializeAs: null). */
  @column({ serializeAs: null })
  declare businessUnitId: number

  @column.dateTime({ autoCreate: true })
  declare platformTenantGroupMemberCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformTenantGroupMemberUpdatedAt: DateTime | null

  @belongsTo(() => PlatformTenantGroup, {
    foreignKey: 'platformTenantGroupId',
    localKey: 'platformTenantGroupId',
  })
  declare group: BelongsTo<typeof PlatformTenantGroup>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
