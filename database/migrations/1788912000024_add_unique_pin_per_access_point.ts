import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

const TABLE = 'access_point_employees'
const COLUMN = 'access_point_employee_pin_in_use'
const INDEX = 'uq_access_point_employee_pin_in_use'

/**
 * Un PIN, una persona: la garantia baja a la base.
 *
 * Hasta ahora la unicidad del numero dentro de un equipo dependia solo del
 * cerrojo de la aplicacion, y hay un camino que no pasa por el: el canal crea
 * el pivote por su cuenta cuando ve un PIN suelto que casa con el codigo de un
 * colaborador. Si eso coincide con un alta desde el Backoffice, dos personas
 * acaban con el mismo numero en el mismo aparato y sus checadas se acreditan
 * mal, en silencio. Con el indice, el segundo intento falla y se puede
 * reintentar.
 *
 * La columna es generada y vale `NULL` cuando el numero no cuenta -- fila con
 * baja logica, PIN vacio, o vinculo ya `revoked`, que libera el numero. En
 * MySQL los `NULL` no chocan entre si, que es justo lo que hace falta: el
 * indice solo vigila los PIN vivos. Los de una baja sin confirmar SI cuentan,
 * porque hasta que el equipo la aplica ese numero sigue siendo de quien lo
 * tenia.
 *
 * Es `VIRTUAL`: no ocupa espacio en la fila y se calcula al leer. El indice
 * secundario sobre una columna virtual si se materializa, que es lo que se
 * necesita.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * Antes de crear el indice se comprueba que nadie comparta numero. Sin
     * esto, el `ALTER` fallaria con un duplicado sin decir cual, y habria que
     * buscarlo a mano en produccion.
     */
    this.defer(async () => {
      const duplicados = await db.rawQuery(
        `SELECT \`access_point_id\`, \`access_point_employee_pin\`, COUNT(*) AS repetidos
         FROM \`${TABLE}\`
         WHERE \`access_point_employee_deleted_at\` IS NULL
           AND \`access_point_employee_pin\` <> ''
           AND \`access_point_employee_sync_status\` <> 'revoked'
         GROUP BY 1, 2
         HAVING COUNT(*) > 1`
      )
      const filas = (duplicados?.[0] ?? []) as Array<{
        access_point_id: number
        access_point_employee_pin: string
      }>
      if (filas.length > 0) {
        const detalle = filas
          .map((fila) => `equipo ${fila.access_point_id} PIN ${fila.access_point_employee_pin}`)
          .join(', ')
        throw new Error(
          `No se puede crear el indice unico: ya hay PIN repetidos en el mismo equipo (${detalle}). ` +
            'Resuelve a quien pertenece cada numero antes de volver a migrar.'
        )
      }
    })

    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
       ADD COLUMN \`${COLUMN}\` VARCHAR(50)
       GENERATED ALWAYS AS (
         CASE
           WHEN \`access_point_employee_deleted_at\` IS NULL
            AND \`access_point_employee_pin\` <> ''
            AND \`access_point_employee_sync_status\` <> 'revoked'
           THEN \`access_point_employee_pin\`
           ELSE NULL
         END
       ) VIRTUAL`
    )

    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
       ADD UNIQUE INDEX \`${INDEX}\` (\`access_point_id\`, \`${COLUMN}\`)`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``)
    this.schema.raw(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${COLUMN}\``)
  }
}
