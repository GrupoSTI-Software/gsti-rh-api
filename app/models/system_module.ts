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
 *        description: >
 *          Módulo del sistema (apartado del menú lateral de Valanserh).
 *          La relación `systemModuleGroup` se precarga **siempre** en los
 *          endpoints que devuelven módulos: `null` significa "módulo suelto"
 *          (sin grupo activo); la clave **nunca** está ausente en el JSON.
 *          Ausente y nulo son estados distintos — nunca se confunden
 *          (USRH1788282413110 §9.3).
 *        properties:
 *          systemModuleId:
 *            type: number
 *            description: Identificador interno del módulo.
 *          systemModuleName:
 *            type: string
 *            description: Nombre legible del módulo.
 *          systemModuleSlug:
 *            type: string
 *            description: Clave estable para rutas e i18n.
 *          systemModuleDescription:
 *            type: string
 *            description: Descripción del módulo.
 *          systemModules:
 *            type: string
 *            description: Campo legacy de permisos del módulo.
 *          systemModulePath:
 *            type: string
 *            description: Ruta de navegación del módulo.
 *          systemModuleGroupId:
 *            type: number
 *            nullable: true
 *            description: >
 *              FK al grupo del catálogo. `null` cuando el módulo es suelto
 *              (no pertenece a ningún grupo activo). Señal primaria de módulo suelto.
 *          systemModuleGroup:
 *            nullable: true
 *            description: >
 *              Objeto del grupo al que pertenece el módulo, **siempre precargado**.
 *              `null` cuando el módulo es suelto o su grupo fue dado de baja.
 *              La clave está **siempre presente** en el JSON: ausente ≠ nulo.
 *              Nunca llega como `""` ni como la cadena `"Sin grupo"`.
 *            allOf:
 *              - $ref: '#/components/schemas/SystemModuleGroup'
 *          systemModuleOrder:
 *            type: number
 *            description: >
 *              Posición del módulo dentro de su grupo. Misma escala que
 *              `systemModuleGroupOrder` (múltiplos de 10) para que los módulos
 *              sueltos puedan intercalarse entre grupos sin recalcular.
 *          systemModuleActive:
 *            type: number
 *            description: Estado de disponibilidad global del módulo (1 activo, 0 inactivo).
 *          systemModulePermissionEnforcementActive:
 *            type: boolean
 *            description: Indica si el módulo exige permisos explícitos (USRH1785766406721).
 *          systemModuleIcon:
 *            type: string
 *            description: Icono del módulo.
 *          systemModuleCreatedAt:
 *            type: string
 *          systemModuleUpdatedAt:
 *            type: string
 *          systemModuleDeletedAt:
 *            type: string
 *            nullable: true
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
