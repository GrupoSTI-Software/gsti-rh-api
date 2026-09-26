import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import SystemModule from '#models/system_module'

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemModuleGroup:
 *       type: object
 *       description: >
 *         Grupo del menú lateral al que pertenece un conjunto de módulos del
 *         sistema. Es un catálogo global del producto: una ficha la ven todas
 *         las empresas por igual y no puede contener ningún dato específico de
 *         un cliente (USRH1788282413065).
 *       properties:
 *         systemModuleGroupId:
 *           type: number
 *           description: Identificador interno del grupo.
 *         systemModuleGroupName:
 *           type: string
 *           description: Nombre legible del grupo, sin prefijo numérico.
 *         systemModuleGroupKey:
 *           type: string
 *           description: Clave estable en kebab-case para i18n y seeders.
 *         systemModuleGroupIcon:
 *           type: string
 *           nullable: true
 *           description: >
 *             Icono del grupo. NULL mientras no se pueble en "Sembrar el
 *             catálogo de grupos y publicar la resolución por clave"; el
 *             cliente cae al icono genérico RAIL_GENERIC_ICON.
 *         systemModuleGroupOrder:
 *           type: number
 *           description: Posición del grupo en el menú (sin empates).
 *         systemModuleGroupCreatedAt:
 *           type: string
 *         systemModuleGroupUpdatedAt:
 *           type: string
 *           nullable: true
 *         systemModuleGroupDeletedAt:
 *           type: string
 *           nullable: true
 */
export default class SystemModuleGroup extends compose(BaseModel, SoftDeletes) {
  static table = 'system_module_groups'

  @column({ isPrimary: true })
  declare systemModuleGroupId: number

  @column()
  declare systemModuleGroupName: string

  @column()
  declare systemModuleGroupKey: string

  /** NULL hasta que "Sembrar el catálogo de grupos" pueble el icono. */
  @column()
  declare systemModuleGroupIcon: string | null

  @column()
  declare systemModuleGroupOrder: number

  // La columna generada `system_module_group_key_active` NO se declara:
  // es de solo lectura del motor y Lucid intentaría escribirla en cada save().

  @column.dateTime({ autoCreate: true, columnName: 'system_module_group_created_at' })
  declare systemModuleGroupCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'system_module_group_updated_at' })
  declare systemModuleGroupUpdatedAt: DateTime

  @column.dateTime({ columnName: 'system_module_group_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => SystemModule, { foreignKey: 'systemModuleGroupId' })
  declare systemModules: HasMany<typeof SystemModule>
}
