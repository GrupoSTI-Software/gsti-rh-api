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
 *          businessUnitId:
 *            type: number
 *            nullable: true
 *            description: Empresa dueña del rol; null solo en el rol global de plataforma
 *          roleDescription:
 *            type: string
 *            description: Role description
 *          roleActive:
 *            type: number
 *            description: Role status
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

  /**
   * Empresa dueña del rol. `null` solo en `root`, el rol global de la
   * plataforma: cualquier otro rol pertenece a una empresa y el candado
   * (empresa, slug) de `1789528501204` hace que su identidad sea el par.
   */
  @column()
  declare businessUnitId: number | null

  @column()
  declare roleDescription: string

  @column()
  declare roleActive: number

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
