import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Columna que se normaliza. */
const COLUMNA = 'exception_request_status'

/** Estatus que se retira del enum por ser sinonimo de `pending`. */
const ESTATUS_RETIRADO = 'requested'

/** Unico nombre del estado "no resuelta" despues de esta migracion. */
const ESTATUS_VIGENTE = 'pending'

/** Enum destino: tres estados, uno por situacion real de la solicitud. */
const ENUM_NUEVO = "ENUM('pending','accepted','refused')"

/** Enum original, con el sinonimo; solo lo usa `down()`. */
const ENUM_ANTERIOR = "ENUM('requested','pending','accepted','refused')"

/**
 * Colapsa `exception_requests.exception_request_status` a tres estados y
 * normaliza los datos: `requested` pasa a `pending`.
 *
 * ## Por que
 * El enum nacio con dos nombres para el MISMO estado —`requested`, default de
 * la columna desde `1730138287439`, y `pending`, lo que el front manda siempre
 * al crear— y nada los reconciliaba:
 *
 * - Ninguna ruta transiciona `requested` a `pending`.
 * - `ExceptionRequestsController.updateStatus` solo acepta `accepted`/`refused`
 *   (rechaza cualquier otro con 400), asi que una solicitud en `requested` no se
 *   puede resolver desde el backoffice.
 * - `VacationAuthorizationSignaturesService` ya los trataba como equivalentes
 *   (`whereIn([...])`), evidencia de que la distincion nunca significo nada.
 * - El front entero compara contra `'pending'`: la tarjeta del backoffice no le
 *   pintaba ni badge de resolucion ni boton "Ver detalles" a una solicitud en
 *   `requested`, dejandola muda en el listado.
 *
 * Mientras la columna pueda valer `requested`, cualquier INSERT que omita el
 * estatus vuelve a crear solicitudes inoperables. Por eso el default tambien
 * cambia a `pending`.
 *
 * ## Seguridad en base con datos
 * - El UPDATE no inventa resolucion: mueve entre dos nombres del mismo estado
 *   no resuelto. Ninguna solicitud aprobada o rechazada se toca.
 * - Idempotente y en el orden obligado: primero el UPDATE, despues el MODIFY.
 *   Al reves, MySQL en modo estricto abortaria el ALTER por las filas que
 *   quedarian fuera del enum nuevo.
 * - Si la columna ya no admite `requested` (base donde esto ya corrio), sale por
 *   el early-return sin tocar nada.
 */
export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.defer(async (db) => {
      const tipoActual = await this.tipoDeLaColumna(db)

      // Base ya normalizada: el enum no admite el sinonimo.
      if (!tipoActual.includes(ESTATUS_RETIRADO)) return

      await db.rawQuery(
        `UPDATE \`${this.tableName}\` SET \`${COLUMNA}\` = ? WHERE \`${COLUMNA}\` = ?`,
        [ESTATUS_VIGENTE, ESTATUS_RETIRADO]
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
           MODIFY COLUMN \`${COLUMNA}\` ${ENUM_NUEVO} NOT NULL DEFAULT '${ESTATUS_VIGENTE}'`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      const tipoActual = await this.tipoDeLaColumna(db)

      if (tipoActual.includes(ESTATUS_RETIRADO)) return

      // Solo se devuelve la FORMA de la columna. Las filas que el `up()` movio a
      // `pending` se quedan ahi: ya normalizadas son indistinguibles de las que
      // el front creo como `pending`, y adivinar cuales volver a `requested`
      // inventaria historia. Como los dos valores significaban lo mismo, no
      // perder esa distincion no pierde informacion.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
           MODIFY COLUMN \`${COLUMNA}\` ${ENUM_ANTERIOR} NOT NULL DEFAULT '${ESTATUS_RETIRADO}'`
      )
    })
  }

  /**
   * Definicion cruda del tipo de la columna (`enum('pending',...)`), que es lo
   * unico que dice si el sinonimo sigue admitido.
   *
   * Falla RUIDOSO si la columna no aparece: devolver cadena vacia haria que
   * `up()` saliera por el early-return creyendo la base ya normalizada, y el
   * default seguiria creando solicitudes inoperables sin que nada lo avise.
   */
  private async tipoDeLaColumna(db: QueryClientContract): Promise<string> {
    const rows = await db.rawQuery(
      `SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, COLUMNA]
    )
    const fila = Array.isArray(rows) ? (rows[0] as Array<{ tipo: string }>)[0] : undefined

    if (fila?.tipo === undefined) {
      throw new Error(
        `${this.tableName}: no existe la columna ${COLUMNA}. La crea ` +
          '1730138287439_create_create_exception_requests_table; corre esa migracion antes.'
      )
    }

    return fila.tipo
  }
}
