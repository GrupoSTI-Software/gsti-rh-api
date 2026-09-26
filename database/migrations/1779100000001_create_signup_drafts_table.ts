import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crea la tabla `signup_drafts` para guardar el borrador temporal del wizard
 * de registro self-service (datos personales → empresa → OTP → contraseña).
 *
 * Detalles de diseño:
 *
 * - PK BIGINT UNSIGNED: tabla de alta rotación con posible cleanup tardío;
 *   nos sobra rango aunque acumule históricos sin purgar.
 * - Soft delete: `signup_draft_deleted_at` para auditoría y para liberar el
 *   email tras una baja explícita sin perder rastro.
 * - UNIQUE filtrado en MySQL: el patrón "UNIQUE (email, deleted_at)" NO funciona
 *   como filtered index en MySQL porque NULL no participa en UNIQUE. La solución
 *   estándar es una columna generada virtual `is_active` que vale 1 cuando el
 *   draft está activo y NULL cuando está soft-deleted; al estar en NULL no
 *   participa en UNIQUE y permite reusar el email tras la baja. Funciona en
 *   MySQL >= 5.7 sin requerir trigger ni lógica de aplicación.
 * - Índice en `signup_draft_pin_expires_at` para el job futuro de limpieza de
 *   drafts vencidos (fuera de alcance de este ticket).
 */
export default class extends BaseSchema {
  protected tableName = 'signup_drafts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('signup_draft_id').notNullable()

      table.string('signup_draft_email', 200).notNullable()
      table.string('signup_draft_first_name', 100).notNullable()
      table.string('signup_draft_last_name', 100).notNullable()
      table.string('signup_draft_second_last_name', 100).nullable()
      table.string('signup_draft_business_unit_name', 200).notNullable()

      table.string('signup_draft_pin_code', 6).nullable()
      table.timestamp('signup_draft_pin_expires_at').nullable().defaultTo(null)
      table.timestamp('signup_draft_email_verified_at').nullable().defaultTo(null)
      table.string('signup_draft_token', 64).nullable()

      table.timestamp('signup_draft_created_at').notNullable().defaultTo(this.now())
      table.timestamp('signup_draft_updated_at').nullable()
      table.timestamp('signup_draft_deleted_at').nullable().defaultTo(null)
    })

    /**
     * Columna generada virtual y UNIQUE compuesto: emula un filtered index en
     * MySQL para garantizar "máximo un draft activo por email" sin bloquear el
     * reuso tras un soft-delete. Se crea fuera del callback de `createTable`
     * porque Knex no expone `generatedAs` para columnas virtuales en MySQL.
     */
    this.schema.raw(`
      ALTER TABLE \`signup_drafts\`
      ADD COLUMN \`signup_draft_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`signup_draft_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`signup_drafts\`
      ADD UNIQUE KEY \`signup_drafts_email_active_unique\`
        (\`signup_draft_email\`, \`signup_draft_is_active\`)
    `)

    this.schema.raw(`
      ALTER TABLE \`signup_drafts\`
      ADD INDEX \`signup_drafts_pin_expires_at_index\`
        (\`signup_draft_pin_expires_at\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
