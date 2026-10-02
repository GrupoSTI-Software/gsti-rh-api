import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1789097550395 — suma de los importes capturados TAL COMO SE IMPRIMIÓ en
 * el convenio de terminación, parte del snapshot de la emisión (regla 7): si
 * mañana cambia un importe del expediente, el papel entregado sigue
 * explicándose. NULLABLE y sin `default`: NULL en toda constancia y en toda
 * emisión anterior a esta historia (no imprimieron ninguna cantidad); un
 * `0.00` mentiría sobre ellas. `decimal(14,2)` por K-8: el importe por
 * pendiente ya es `decimal(12,2)` y la SUMA de varios cercanos al máximo
 * desbordaría una columna del mismo ancho. Sin índice: no se filtra ni se
 * ordena por ella. La cantidad con letra NO se persiste: se deriva del número.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_documents'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .decimal('employee_offboarding_document_total_amount', 14, 2)
        .nullable()
        .after('employee_offboarding_document_template_version_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_offboarding_document_total_amount')
    })
  }
}
