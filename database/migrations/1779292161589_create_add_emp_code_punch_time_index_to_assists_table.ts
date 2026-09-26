import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Índice compuesto (assist_emp_code, assist_punch_time_utc) para attendance-stats.
 *
 * El módulo attendance-stats correlaciona punches con cada (empleado, día) por
 * código de empleado Y ventana de tiempo. Con solo el índice suelto de
 * assist_emp_code, MySQL traía todos los punches del empleado (~745) y filtraba
 * por tiempo en memoria. El índice compuesto permite aplicar el rango de tiempo
 * dentro del índice — la consulta del mes baja de ~3.5s a sub-segundo.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.index(
        ['assist_emp_code', 'assist_punch_time_utc'],
        'assists_emp_code_punch_time_index'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['assist_emp_code', 'assist_punch_time_utc'],
        'assists_emp_code_punch_time_index'
      )
    })
  }
}
