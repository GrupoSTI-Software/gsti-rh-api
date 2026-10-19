import { BaseSchema } from '@adonisjs/lucid/schema'

const TABLE = 'access_point_shares'

/**
 * Empresas invitadas a un checador ajeno (VLRH-P0065, 3.1).
 *
 * La responsable sigue en `access_points.business_unit_id`; aqui solo viven
 * las invitadas. Lo escribe solo el landlord. La columna virtual vale NULL
 * cuando la invitacion esta revocada, asi el indice unico solo vigila las
 * vivas (mismo patron que `1788912000024`).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable(TABLE, (table) => {
      table.increments('access_point_share_id')
      table.integer('access_point_id').unsigned().notNullable()
      table.foreign('access_point_id').references('access_points.access_point_id')
      table.integer('business_unit_id').unsigned().notNullable()
      table.foreign('business_unit_id').references('business_units.business_unit_id')
      table.integer('platform_tenant_group_id').unsigned().notNullable()
      table
        .foreign('platform_tenant_group_id')
        .references('platform_tenant_groups.platform_tenant_group_id')
      table.timestamp('access_point_share_granted_at').notNullable()
      table.integer('access_point_share_granted_by').unsigned().nullable()
      table.timestamp('access_point_share_revoked_at').nullable()
      table.integer('access_point_share_revoked_by').unsigned().nullable()
      table.string('access_point_share_revoke_reason', 32).nullable()
      table.timestamp('access_point_share_created_at').notNullable()
      table.timestamp('access_point_share_updated_at').notNullable()
      table.index(['business_unit_id'], 'idx_access_point_share_bu')
    })
    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
         ADD COLUMN \`access_point_share_live_key\` VARCHAR(32)
         GENERATED ALWAYS AS (
           IF(\`access_point_share_revoked_at\` IS NULL,
              CONCAT(\`access_point_id\`, ':', \`business_unit_id\`), NULL)
         ) VIRTUAL,
         ADD UNIQUE INDEX \`uq_access_point_share_live\` (\`access_point_share_live_key\`)`
    )
  }

  async down() {
    this.schema.dropTable(TABLE)
  }
}
