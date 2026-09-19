import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1789097550389 — amarra cada emisión a la versión de plantilla propia
 * con la que salió. Nace NULLABLE porque la tabla tiene documentos legales
 * vivos: NULL = plantilla del sistema, y así se leen todas las filas
 * anteriores (regla 4). FK RESTRICT: una versión referida por una emisión no
 * puede desaparecer (además ninguna versión se borra, regla 5 de
 * USRH1788553841100). Sin índice adicional: el uso es lectura por fila, no
 * búsqueda; la tabla sigue sin índices únicos por decisión de 1786510000030.
 * Nombre corto explícito de la FK por el límite de 64 caracteres de MySQL.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_documents'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('employee_offboarding_document_template_version_id')
        .unsigned()
        .nullable()
        .after('employee_offboarding_document_generated_by_user_id')
      table
        .foreign('employee_offboarding_document_template_version_id', 'fk_emp_offb_doc_tpl_ver')
        .references('employee_offboarding_document_template_id')
        .inTable('employee_offboarding_document_templates')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['employee_offboarding_document_template_version_id'],
        'fk_emp_offb_doc_tpl_ver'
      )
      table.dropColumn('employee_offboarding_document_template_version_id')
    })
  }
}
