import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Registro electrónico de jornada (una fila por trabajador y día calendario).
 *
 * Base de la obligación de la reforma LFT (DOF 1-may-2026, exigible 1-ene-2027):
 * registro inalterable de inicio/término de jornada con prueba plena.
 *
 * Ciclo de vida: `open` (editable, refleja el cálculo vigente) → `closed`
 * (congelado, con snapshot canónico + sello HMAC-SHA-256 e inmutable).
 *
 * Multi-tenant: `business_unit_id` aísla por empresa (withBusinessUnitScope).
 */
export default class extends BaseSchema {
  protected tableName = 'work_journal_entries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('work_journal_entry_id').notNullable()

      // FK sin cascada: las entradas selladas se conservan aunque se dé de
      // baja el empleado (valor probatorio).
      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      // Contexto de evaluación del día (snapshot del id, no referencia viva).
      table.integer('working_time_rule_id').unsigned().nullable()
      table.integer('shift_id').unsigned().nullable()

      table.date('work_journal_entry_date').notNullable()

      // Periodo de nómina al que pertenece la entrada (rango dado por el llamador).
      table.date('work_journal_entry_period_start').notNullable()
      table.date('work_journal_entry_period_end').notNullable()

      // Jornada (snapshot, UTC-6 ya resuelto por el cálculo de asistencia).
      table.dateTime('work_journal_entry_check_in').nullable()
      table.dateTime('work_journal_entry_check_out').nullable()
      table.integer('work_journal_entry_worked_minutes').nullable()

      // Estado del día en texto: ontime/tolerance/delay/fault/rest/holiday/
      // vacation/absence/disability.
      table.string('work_journal_entry_day_status', 30).notNullable()

      table
        .enum('work_journal_entry_status', ['open', 'closed'])
        .notNullable()
        .defaultTo('open')
      table.dateTime('work_journal_entry_closed_at').nullable()

      // Copia canónica de lo sellado + huella HMAC + versión de llave.
      table.json('work_journal_entry_snapshot').nullable()
      table.string('work_journal_entry_content_hash', 64).nullable()
      table.smallint('work_journal_entry_hmac_key_version').nullable()

      table.timestamp('work_journal_entry_created_at').notNullable()
      table.timestamp('work_journal_entry_updated_at').nullable()
      table.timestamp('work_journal_entry_deleted_at').nullable()

      table
        .foreign('employee_id', 'fk_wje_employee')
        .references('employees.employee_id')
        .onDelete('RESTRICT')
      table
        .foreign('business_unit_id', 'fk_wje_business_unit')
        .references('business_units.business_unit_id')
      table
        .foreign('working_time_rule_id', 'fk_wje_working_time_rule')
        .references('working_time_rules.working_time_rule_id')
      table.foreign('shift_id', 'fk_wje_shift').references('shifts.shift_id')

      // Un único registro por trabajador y día calendario (regla de negocio #1).
      // No se incluye deleted_at: en MySQL los NULL se tratan como distintos y
      // permitirían duplicados entre filas activas, rompiendo el invariante.
      table.unique(['employee_id', 'work_journal_entry_date'], {
        indexName: 'uq_wje_employee_date',
      })
      table.index(['business_unit_id', 'work_journal_entry_date'], 'idx_wje_bu_date')
      table.index(
        ['business_unit_id', 'work_journal_entry_period_start'],
        'idx_wje_bu_period'
      )
      table.index(['work_journal_entry_status'], 'idx_wje_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
