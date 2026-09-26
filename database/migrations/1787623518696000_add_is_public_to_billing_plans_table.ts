import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca de plan público de la landing (USRH1787619255298).
 *
 * Un solo plan público en toda la plataforma vía columna generada
 * `billing_plan_is_public_active` + UNIQUE de una sola columna. La expresión
 * incluye el soft-delete: un plan borrado libera el slot automáticamente.
 * Se crean fuera del callback de `alterTable` porque Knex no expone
 * `generatedAs` para columnas virtuales en MySQL.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .tinyint('billing_plan_is_public')
        .notNullable()
        .defaultTo(0)
        .comment('1 = plan que se publica en la landing. Máximo uno vivo en toda la plataforma.')
    })

    this.schema.raw(`
      ALTER TABLE \`billing_plans\`
      ADD COLUMN \`billing_plan_is_public_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`billing_plan_is_public\` = 1 AND \`billing_plan_deleted_at\` IS NULL
               THEN 1 ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`billing_plans\`
      ADD UNIQUE KEY \`billing_plans_public_unique\` (\`billing_plan_is_public_active\`)
    `)
  }

  async down() {
    this.schema.raw('ALTER TABLE `billing_plans` DROP INDEX `billing_plans_public_unique`')
    this.schema.raw('ALTER TABLE `billing_plans` DROP COLUMN `billing_plan_is_public_active`')
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_plan_is_public')
    })
  }
}
