import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RoleSystemPermission from './role_system_permission.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import RoleDepartment from './role_department.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      Role:
 *        type: object
 *        properties:
 *          roleId:
 *            type: number
 *            description: Role id
 *          roleName:
 *            type: string
 *            description: Role name
 *          roleSlug:
 *            type: string
 *            description: Role slug
 *          roleDescription:
 *            type: string
 *            description: Role description
 *          roleActive:
 *            type: number
 *            description: Role status
 *          roleBusinessAccess:
 *            type: string
 *            description: Business access
 *          roleManagementDays:
 *            type: number
 *            description: Role management days
 *          roleCreatedAt:
 *            type: string
 *          roleUpdatedAt:
 *            type: string
 *          roleDeletedAt:
 *            type: string
 *
 */
export default class Role extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare roleId: number

  @column()
  declare roleName: string

  @column()
  declare roleSlug: string

  @column()
  declare roleDescription: string

  @column()
  declare roleActive: number

  @column()
  declare roleBusinessAccess: string

  @column()
  declare roleManagementDays: number | null

  @column.dateTime({ autoCreate: true })
  declare roleCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare roleUpdatedAt: DateTime

  @column.dateTime({ columnName: 'role_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => RoleSystemPermission, {
    foreignKey: 'roleId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('systemPermissions')
        query.whereHas('systemPermissions', (bundle) => {
          bundle.whereHas('systemModule', (moduleBundle) => {
            moduleBundle.where('system_module_active', 1)
          })
        })
      }
    },
  })
  declare roleSystemPermissions: HasMany<typeof RoleSystemPermission>

  @hasMany(() => RoleDepartment, {
    foreignKey: 'roleId',
  })
  declare roleDepartments: HasMany<typeof RoleDepartment>
}
