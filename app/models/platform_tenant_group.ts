import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import PlatformTenantGroupMember from './platform_tenant_group_member.js'

/**
 * Grupo económico de tenants (USRH1788052455657).
 * Dato global de GSTI: sin `business_unit_id` ni mixin de scope.
 * La columna generada `platform_tenant_group_name_active` no se declara: es de base de datos.
 */
export default class PlatformTenantGroup extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'platform_tenant_groups'

  @column({ isPrimary: true })
  declare platformTenantGroupId: number

  @column()
  declare platformTenantGroupName: string

  /** Vigencia del grupo: 1 activo, 0 inactivo. Nace activo. */
  @column()
  declare platformTenantGroupActive: number

  @column.dateTime({ autoCreate: true })
  declare platformTenantGroupCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformTenantGroupUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'platform_tenant_group_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => PlatformTenantGroupMember, {
    foreignKey: 'platformTenantGroupId',
    localKey: 'platformTenantGroupId',
  })
  declare members: HasMany<typeof PlatformTenantGroupMember>
}
