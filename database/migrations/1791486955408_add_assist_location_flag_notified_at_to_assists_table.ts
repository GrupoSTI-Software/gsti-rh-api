import { BaseSchema } from '@adonisjs/lucid/schema'

const PENDING_INDEX = 'idx_assists_location_flag_pending'
const PENDING_INDEX_COLUMNS = [
  'assist_location_flag',
  'assist_location_flag_notified_at',
  'business_unit_id',
  'assist_created_at',
]

/**
 * Momento en que la checada con ubicación simulada se avisó a RH por correo
 * (VLRH-H1791056340278). NULL = no avisada. Sin backfill: el aviso solo mira
 * los últimos siete días, así que el histórico no se manda.
 *
 * Sin `.after(...)`: al final de la tabla el ADD COLUMN es INSTANT en MySQL
 * 8.0.12+. El índice empieza por las dos igualdades del predicado "pendiente"
 * (casi toda la tabla tiene la marca en NULL), luego la empresa, que cubre el
 * DISTINCT y el reclamo, y al final el rango de antigüedad.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('assist_location_flag_notified_at').nullable()
      table.index(PENDING_INDEX_COLUMNS, PENDING_INDEX)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(PENDING_INDEX_COLUMNS, PENDING_INDEX)
      table.dropColumn('assist_location_flag_notified_at')
    })
  }
}
