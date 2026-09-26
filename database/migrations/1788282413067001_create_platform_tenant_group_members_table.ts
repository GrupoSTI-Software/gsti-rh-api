import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pertenencia de una cuenta a un grupo (USRH1788052455657).
 * Una membresía existe o no existe: sin `deleted_at` ni `active`.
 * La regla "una cuenta a lo más un grupo" vive en UNIQUE(business_unit_id), no en el servicio.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_tenant_group_members'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_tenant_group_member_id').notNullable()

      table
        .integer('platform_tenant_group_id')
        .unsigned()
        .notNullable()
        .references('platform_tenant_group_id')
        .inTable('platform_tenant_groups')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.timestamp('platform_tenant_group_member_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_tenant_group_member_updated_at').nullable()

      // Regla 4 de la HU en la base de datos.
      table.unique(['business_unit_id'], { indexName: 'uq_platform_tenant_group_member_bu' })
      // Para el listado y el futuro desglose de MRR por grupo.
      table.index(['platform_tenant_group_id'], 'idx_platform_tenant_group_member_group')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
