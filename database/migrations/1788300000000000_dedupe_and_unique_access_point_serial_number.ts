import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Hace irrepetible `access_points.access_point_serial_number` en todo el
 * sistema (USRH1787193625428). El código ya se comportaba como si la serie
 * fuera única global (`AccessPointService.findBySerialNumber` busca sin
 * filtro de tenant y toma la primera fila) pero nada lo garantizaba en BD.
 *
 * Tres pasos, en este orden estricto dentro del mismo `up()`:
 *
 *   1) Crear `access_point_serial_dedupe_log` — constancia forense
 *      append-only de todo lo que este saneo mueve. Sin FK: es forense,
 *      la fila referida puede desaparecer más adelante.
 *
 *   2) Saneo en dos pasadas, con `this.defer()` + `rawQuery` (NUNCA
 *      `await this.schema...`, ver regla del proyecto sobre doble
 *      ejecución de `this.schema`):
 *
 *      2.a) Duplicados entre filas VIVAS: por cada serie con más de una
 *           fila viva se conserva el `access_point_id` mínimo; las demás
 *           quedan con baja lógica y la serie anulada.
 *
 *      2.b) Series secuestradas por filas YA MUERTAS: el índice único es
 *           de una sola columna y no sabe nada de `access_point_deleted_at`,
 *           así que una fila muerta con serie SÍ colisiona con una viva con
 *           la misma serie. `AccessPointService.delete()` hace `.delete()`
 *           sin anular la serie, así que este histórico existe con
 *           seguridad. Sin este paso el UNIQUE del paso 3 no se puede crear.
 *
 *      Idempotente: tras la primera corrida no quedan grupos con más de una
 *      fila viva por serie ni filas muertas con serie, así que una segunda
 *      ejecución no toca nada (verificado con SELECT de conteo == 0 antes
 *      de cada UPDATE).
 *
 *      Escritor concurrente: `start/socket.ts` (handler `device-info`)
 *      escribe sobre esta misma tabla en cualquier momento. La ventana de
 *      mantenimiento debe correr, preferentemente, con el canal de sockets
 *      detenido. Si el paso 3 falla por una fila creada entre 2.b y 3, esta
 *      migración se puede volver a correr sin daño (es idempotente).
 *
 *   3) UNIQUE `uq_access_point_serial_number` sobre la sola columna. En
 *      MySQL los NULL no colisionan entre sí, así que toda alta manual del
 *      BO (que siempre nace con serie null) sigue conviviendo sin problema;
 *      por eso el saneo anula la serie de todo lo que descarta en vez de
 *      dejarla puesta en una fila dada de baja.
 *
 * `down()`: quita el índice y la tabla de constancia. El saneo (la
 * deduplicación de datos ya movidos) NO se revierte — no hay snapshot del
 * estado previo a esta migración.
 */
export default class extends BaseSchema {
  protected tableName = 'access_points'
  protected dedupeLogTable = 'access_point_serial_dedupe_log'

  async up() {
    this.schema.createTable(this.dedupeLogTable, (table) => {
      table.increments('access_point_serial_dedupe_log_id').notNullable()
      table.integer('access_point_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table.string('access_point_serial_dedupe_log_serial', 100).notNullable()
      table.integer('access_point_serial_dedupe_log_kept_id').unsigned().notNullable()
      table
        .timestamp('access_point_serial_dedupe_log_created_at')
        .notNullable()
        .defaultTo(this.now())
    })

    this.defer(async (db) => {
      // 2.a — duplicados entre filas vivas: conservar el id mínimo por serie.
      await db.rawQuery(
        `INSERT INTO access_point_serial_dedupe_log
           (access_point_id, business_unit_id, access_point_serial_dedupe_log_serial,
            access_point_serial_dedupe_log_kept_id)
         SELECT ap.access_point_id, ap.business_unit_id, ap.access_point_serial_number, keep.min_id
         FROM access_points ap
         JOIN (
           SELECT access_point_serial_number, MIN(access_point_id) AS min_id
           FROM access_points
           WHERE access_point_deleted_at IS NULL
             AND access_point_serial_number IS NOT NULL
             AND access_point_serial_number != ''
           GROUP BY access_point_serial_number
           HAVING COUNT(*) > 1
         ) keep ON keep.access_point_serial_number = ap.access_point_serial_number
         WHERE ap.access_point_deleted_at IS NULL
           AND ap.access_point_id != keep.min_id`
      )

      await db.rawQuery(
        `UPDATE access_points ap
         JOIN (
           SELECT access_point_serial_number, MIN(access_point_id) AS min_id
           FROM access_points
           WHERE access_point_deleted_at IS NULL
             AND access_point_serial_number IS NOT NULL
             AND access_point_serial_number != ''
           GROUP BY access_point_serial_number
           HAVING COUNT(*) > 1
         ) keep ON keep.access_point_serial_number = ap.access_point_serial_number
         SET ap.access_point_deleted_at = NOW(), ap.access_point_serial_number = NULL
         WHERE ap.access_point_deleted_at IS NULL
           AND ap.access_point_id != keep.min_id`
      )

      // 2.b — series secuestradas por filas ya muertas de antes de esta
      // migración. kept_id = la fila viva que conserva esa serie hoy, o el
      // propio id de la fila muerta cuando no hay ninguna viva con esa serie.
      await db.rawQuery(
        `INSERT INTO access_point_serial_dedupe_log
           (access_point_id, business_unit_id, access_point_serial_dedupe_log_serial,
            access_point_serial_dedupe_log_kept_id)
         SELECT dead.access_point_id, dead.business_unit_id, dead.access_point_serial_number,
                COALESCE(
                  (SELECT MIN(alive.access_point_id)
                   FROM access_points alive
                   WHERE alive.access_point_deleted_at IS NULL
                     AND alive.access_point_serial_number = dead.access_point_serial_number),
                  dead.access_point_id
                )
         FROM access_points dead
         WHERE dead.access_point_deleted_at IS NOT NULL
           AND dead.access_point_serial_number IS NOT NULL`
      )

      await db.rawQuery(
        `UPDATE access_points
         SET access_point_serial_number = NULL
         WHERE access_point_deleted_at IS NOT NULL
           AND access_point_serial_number IS NOT NULL`
      )
    })

    // NUNCA usar `await` con `this.schema` (regla del proyecto): el builder
    // se ejecuta de forma diferida al terminar `up()`, después del `defer`
    // anterior, por lo que el saneo ya corrió cuando se intenta crear el
    // índice.
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['access_point_serial_number'], {
        indexName: 'uq_access_point_serial_number',
      })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['access_point_serial_number'], 'uq_access_point_serial_number')
    })
    this.schema.dropTableIfExists(this.dedupeLogTable)
    // El saneo (baja lógica + anulación de serie ya aplicada a los datos)
    // NO se revierte: no existe snapshot del estado previo a esta migración.
  }
}
