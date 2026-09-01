import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import SystemPermission from './system_permission.js'
import SystemFeature from '#models/system_feature'
import SystemModuleGroup from '#models/system_module_group'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

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
 *          systemModuleGroupId:
 *            type: number
 *            nullable: true
 *            description: FK al grupo del menú (null si es módulo suelto).
 *          systemModuleOrder:
 *            type: number
 *            description: Posición del módulo dentro de su grupo.
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

  /** FK al catálogo de grupos. NULL cuando el módulo es suelto (regla 5). */
  @column()
  declare systemModuleGroupId: number | null

  /** Posición del módulo dentro de su grupo (backfill = system_module_id * 10). */
  @column()
  declare systemModuleOrder: number

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

  /**
   * Grupo del menú al que pertenece este módulo.
   * El nombre de la relación reutiliza `systemModuleGroup` a propósito
   * (addendum §D de USRH1788282413065): el campo pasa de string a
   * object | null en el JSON.  Aceptado bajo W2 (release atómico de 3 repos).
   */
  @belongsTo(() => SystemModuleGroup, { foreignKey: 'systemModuleGroupId' })
  declare systemModuleGroup: BelongsTo<typeof SystemModuleGroup>
}
