import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

const TABLE = 'access_point_employees'
const COLUMN = 'access_point_employee_pin_in_use'
const INDEX = 'uq_access_point_employee_pin_in_use'

/**
 * Un numero no se recicla: la baja confirmada deja de liberarlo.
 *
 * La version anterior de esta columna soltaba el PIN en cuanto el vinculo
 * quedaba `revoked`, con el argumento de que el aparato ya habia confirmado el
 * borrado. La aplicacion nunca lo hizo -- su consulta de PIN ocupados cuenta
 * toda fila viva -- asi que el indice era mas permisivo que el codigo y no
 * cubria lo que se creia.
 *
 * Se alinea hacia el lado estricto, no al reves: los equipos guardan checadas
 * cuando estan sin red y las suben al reconectar, asi que un marcaje del dueno
 * anterior puede llegar dias despues de la baja. Si para entonces el numero es
 * de otra persona, esa checada se acredita a quien no la hizo y el error viaja
 * hasta la nomina sin que nadie lo note. El rango de PIN llega a nueve digitos
 * y el limite del aparato es de usuarios registrados, no de numeros: no hay
 * nada que ahorrar reciclando.
 *
 * Sigue fuera del indice la fila con baja logica: retirar la asignacion es
 * otra operacion y hoy si devuelve el numero al monton.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * La definicion nueva es mas estricta que la vigente, asi que puede haber
     * filas que hasta ahora convivian: dos vinculos con el mismo numero donde
     * uno quedo revocado. Sin esta comprobacion el `ALTER` fallaria con un
     * duplicado sin decir cual.
     */
    this.defer(async () => {
      const duplicados = await db.rawQuery(
        `SELECT \`access_point_id\`, \`access_point_employee_pin\`, COUNT(*) AS repetidos
         FROM \`${TABLE}\`
         WHERE \`access_point_employee_deleted_at\` IS NULL
           AND \`access_point_employee_pin\` <> ''
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
          `No se puede reservar el PIN de las bajas: ya hay numeros repetidos en el mismo equipo (${detalle}). ` +
            'Decide a quien pertenece cada uno antes de volver a migrar.'
        )
      }
    })

    /**
     * MySQL no deja cambiar la expresion de una columna generada mientras un
     * indice depende de ella, asi que el indice se retira y se vuelve a poner.
     */
    this.schema.raw(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``)

    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
       MODIFY COLUMN \`${COLUMN}\` VARCHAR(50)
       GENERATED ALWAYS AS (
         CASE
           WHEN \`access_point_employee_deleted_at\` IS NULL
            AND \`access_point_employee_pin\` <> ''
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

    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
       MODIFY COLUMN \`${COLUMN}\` VARCHAR(50)
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
}
