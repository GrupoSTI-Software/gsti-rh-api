import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marcador de normalización de la checada a UTC real.
 *
 * `assist_punch_time_utc` pasa a significar un instante UTC real para todos los
 * canales. El puente BioTime escribía la marca del checador (hora de pared más
 * el offset propio del equipo); desde ahora la convierte al guardar y deja aquí
 * el momento en que lo hizo. El respaldo `attendance:backfill-biotime-utc`
 * recorre las filas históricas con la columna en NULL y las convierte una sola
 * vez: la columna es lo que lo hace idempotente.
 *
 * Nullable sin default: las filas de la app, ADMS y demo ya nacen en UTC real
 * y no necesitan marca; los históricos de BioTime quedan pendientes hasta que
 * corra el respaldo.
 */

const TABLE = 'assists'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.dateTime('assist_punch_time_normalized_at').nullable().after('assist_punch_time_origin')
    })
  }

  async down() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn('assist_punch_time_normalized_at')
    })
  }
}
