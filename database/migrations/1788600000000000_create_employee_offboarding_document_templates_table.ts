import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Plantillas propias del documento de salida (USRH1788553841100): una fila
 * por versión subida, por (empresa, tipo de documento).
 *
 * Decisiones:
 *  - La tabla NACE COMPLETA: los tres estados (`current` | `superseded` |
 *    `rejected`) y `validation_result` desde aquí, para que ESB-05-07-14 y
 *    ESB-05-07-08 escriban sin migrar una tabla que gobierna documentos legales.
 *  - SIN `deleted_at`: ninguna versión se borra (regla 5).
 *  - Una sola vigente por (empresa, tipo): columna generada `..._is_current`
 *    (1 cuando `status = 'current'`, NULL en los demás) + UNIQUE compuesto,
 *    molde `1786737531057000_create_tenant_billing_profiles_table`. Knex no
 *    expone `generatedAs` en MySQL: va por `schema.raw` FUERA de `createTable`.
 *  - UNIQUE (empresa, tipo, versión): el consecutivo no se recicla ni se
 *    duplica bajo carrera.
 *  - FKs `RESTRICT`: un borrado duro nunca deja objetos sin registro.
 *  - Sin `default` en el tipo: habrá dos tipos desde la rebanada 22.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_document_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_offboarding_document_template_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()

      // Literales de EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE (varchar, no enum)
      table.string('employee_offboarding_document_template_document_type', 30).notNullable()
      table
        .integer('employee_offboarding_document_template_version_number')
        .unsigned()
        .notNullable()
      // 'current' | 'superseded' | 'rejected'
      table
        .string('employee_offboarding_document_template_status', 20)
        .notNullable()
        .defaultTo('current')

      // Key privada de S3; nunca URL, nunca viaja al cliente
      table.string('employee_offboarding_document_template_storage_key', 2048).notNullable()
      table.string('employee_offboarding_document_template_original_file_name', 255).notNullable()
      table
        .integer('employee_offboarding_document_template_file_size_bytes')
        .unsigned()
        .notNullable()
      // sha256 hex del buffer TAL COMO quedó almacenado (post-intake)
      table
        .specificType('employee_offboarding_document_template_content_sha256', 'CHAR(64)')
        .notNullable()

      // Lo escribe ESB-05-07-08; NULL = versión sin revisión registrada
      table.json('employee_offboarding_document_template_validation_result').nullable()

      table
        .integer('employee_offboarding_document_template_uploaded_by_user_id')
        .unsigned()
        .nullable()

      table
        .timestamp('employee_offboarding_document_template_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('employee_offboarding_document_template_updated_at').nullable()

      table
        .foreign('business_unit_id', 'fk_eodt_bu')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign(
          'employee_offboarding_document_template_uploaded_by_user_id',
          'fk_eodt_uploaded_by'
        )
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.unique(
        [
          'business_unit_id',
          'employee_offboarding_document_template_document_type',
          'employee_offboarding_document_template_version_number',
        ],
        'uq_eodt_bu_type_version'
      )

      table.index(
        [
          'business_unit_id',
          'employee_offboarding_document_template_document_type',
          'employee_offboarding_document_template_status',
        ],
        'idx_eodt_bu_type_status'
      )
    })

    this.schema.raw(`
      ALTER TABLE \`employee_offboarding_document_templates\`
      ADD COLUMN \`employee_offboarding_document_template_is_current\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`employee_offboarding_document_template_status\` = 'current' THEN 1 ELSE NULL END
        )
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`employee_offboarding_document_templates\`
      ADD UNIQUE KEY \`uq_eodt_bu_type_current\`
        (\`business_unit_id\`, \`employee_offboarding_document_template_document_type\`, \`employee_offboarding_document_template_is_current\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
