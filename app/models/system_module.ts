import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import SystemPermission from './system_permission.js'
import SystemFeature from '#models/system_feature'
import type { HasMany } from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *      SystemModule:
 *        type: object
 *        properties:
 *          systemModuleId:
 *            type: number
 *            description: System module id
 *          systemModuleName:
 *            type: string
 *            description: System module name
 *          systemModuleSlug:
 *            type: string
 *            description: System module slug
 *          systemModuleDescription:
 *            type: string
 *            description: System module description
 *          systemModules:
 *            type: string
 *            description: System module order
 *          systemModulePath:
 *            type: string
 *            description: System module path
 *          systemModuleGroup:
 *            type: string
 *            description: System module group
 *          systemModuleActive:
 *            type: number
 *            description: System module status
 *          systemModulePermissionEnforcementActive:
 *            type: boolean
 *            description: Indica si el módulo exige permisos explícitos (interruptor de USRH1785766406721)
 *          systemModuleIcon:
 *            type: string
 *            description: System module icon path
 *          systemModuleCreatedAt:
 *            type: string
 *          systemModuleUpdatedAt:
 *            type: string
 *          systemModuleDeletedAt:
 *            type: string
 *
 */

export default class SystemModule extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare systemModuleId: number

  @column()
  declare systemModuleName: string

  @column()
  declare systemModuleSlug: string

  @column()
  declare systemModuleDescription: string

  @column()
  declare systemModules: string

  @column()
  declare systemModulePath: string

  @column()
  declare systemModuleGroup: string

  @column()
  declare systemModuleActive: number

  @column({
    prepare: (value: boolean) => value,
    consume: (value: boolean | number) => Boolean(value),
  })
  declare systemModulePermissionEnforcementActive: boolean

  @beforeCreate()
  static assignPermissionEnforcementDefault(systemModule: SystemModule) {
    if (systemModule.systemModulePermissionEnforcementActive === undefined) {
      systemModule.systemModulePermissionEnforcementActive = false
    }
  }

  @column()
  declare systemModuleIcon: string

  @column.dateTime({ autoCreate: true })
  declare systemModuleCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare systemModuleUpdatedAt: DateTime

  @column.dateTime({ columnName: 'system_module_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => SystemPermission, {
    foreignKey: 'systemModuleId',
  })
  declare systemPermissions: HasMany<typeof SystemPermission>

  /** Funcionalidades del producto que pertenecen a este módulo. */
  @hasMany(() => SystemFeature, {
    foreignKey: 'systemModuleId',
  })
  declare features: HasMany<typeof SystemFeature>
}
