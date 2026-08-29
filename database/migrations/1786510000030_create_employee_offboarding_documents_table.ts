import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Documentos emitidos del expediente de salida (USRH1787433503686): hoy la
 * constancia de separación (LFT art. 132 fr. VIII); el discriminador de
 * tipo prepara el convenio de terminación sin rehacer nada.
 *
 * Decisiones de la cadena:
 *  - SNAPSHOT de lo impreso (nombre, puesto, adscripción, fechas, antigüedad,
 *    razón social): los datos de origen son mutables y seis meses después la
 *    fila debe seguir diciendo lo que dijo el papel. Precedente:
 *    `employee_offboarding_item_name`.
 *  - Sin `business_unit_id` propio: el aislamiento lo da el expediente padre
 *    (dos saltos), igual que `employee_offboarding_item_evidences`.
 *  - CERO índices únicos: MySQL no soporta únicos parciales y la tabla lleva
 *    borrado lógico; la unicidad del folio vive en el servicio y el modelo
 *    apilado de re-emisión (hermana H2) necesita varias filas por tipo.
 *  - `varchar` en vez de `enum` para tipo y origen de la fecha: el conjunto
 *    vive en el slice (precedente `employee_offboarding_status`).
 *  - `..._is_current`, `..._superseded_document_id` y `..._size_bytes` nacen
 *    aquí aunque los use H2: no se altera después una tabla con documentos
 *    legales dentro.
 *  - FKs `integer().unsigned()` con nombre corto explícito (límite de 64
 *    caracteres de MySQL). Sin FK en la autorreferencia a propósito.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_documents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_offboarding_document_id').notNullable()

      table.integer('employee_offboarding_id').unsigned().notNullable()

      table
        .string('employee_offboarding_document_type', 30)
        .notNullable()
        .defaultTo('separation_letter')
      table.string('employee_offboarding_document_folio', 40).notNullable()

      // Key de S3 (privada); nunca URL. Ancho del precedente de evidencias.
      table.string('employee_offboarding_document_file', 2048).notNullable()
      table.string('employee_offboarding_document_file_name', 255).notNullable()
      table.integer('employee_offboarding_document_size_bytes').unsigned().notNullable()

      // Snapshot de lo impreso
      table.string('employee_offboarding_document_employee_name', 255).notNullable()
      table.string('employee_offboarding_document_position_name', 100).nullable()
      table.string('employee_offboarding_document_department_name', 100).nullable()
      table.string('employee_offboarding_document_legal_name', 250).notNullable()
      table.date('employee_offboarding_document_hire_date').notNullable()
      table.date('employee_offboarding_document_reference_date').notNullable()
      // 'terminated' | 'planned' — H1a siempre escribe 'terminated'
      table.string('employee_offboarding_document_reference_date_source', 20).notNullable()
      table.integer('employee_offboarding_document_seniority_days').unsigned().notNullable()

      // sha256 hex del buffer del PDF: autentica integridad, no autoría
      table.string('employee_offboarding_document_content_hash', 64).notNullable()

      table.boolean('employee_offboarding_document_is_current').notNullable().defaultTo(true)
      table.integer('employee_offboarding_document_superseded_document_id').unsigned().nullable()
      table.integer('employee_offboarding_document_generated_by_user_id').unsigned().nullable()

      table.datetime('employee_offboarding_document_created_at').notNullable()
      table.datetime('employee_offboarding_document_updated_at').nullable()
      table.datetime('employee_offboarding_document_deleted_at').nullable()

      table
        .foreign('employee_offboarding_id', 'fk_emp_offb_doc_offb')
        .references('employee_offboarding_id')
        .inTable('employee_offboardings')
        .onDelete('CASCADE')

      table
        .foreign('employee_offboarding_document_generated_by_user_id', 'fk_emp_offb_doc_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.index(
        [
          'employee_offboarding_id',
          'employee_offboarding_document_type',
          'employee_offboarding_document_deleted_at',
        ],
        'idx_emp_offb_doc_offb'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
