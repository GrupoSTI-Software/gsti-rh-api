import { randomUUID } from 'node:crypto'
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `employees.employee_slug` pasa de derivado a token opaco.
 *
 * Antes era `nombre-apellido---codigoNomina---id`, y como el Backoffice lo
 * lleva en la URL del navegador, ese formato filtraba el nombre completo y el
 * código de nómina al historial, a los logs de proxy y al header `Referer` de
 * cualquier tercero cargado en la página. El id secuencial del final además
 * delataba el tamaño del padrón. Ahora es un UUIDv4 sin relación con los datos
 * del empleado, asignado por el hook `beforeCreate` del modelo.
 *
 * El tipo no es cosmético. La columna venía `VARCHAR(255)` sin charset propio,
 * así que heredaba el `utf8mb4` de la tabla: un UNIQUE sobre ella son 1020
 * bytes por entrada de índice — cabe en row format DYNAMIC pero revienta en
 * COMPACT/REDUNDANT (límite 767). `CHAR(36) CHARACTER SET ascii` lo deja en 36:
 * 36 es el largo exacto del UUID canónico (32 hex + 4 guiones) y un UUID no
 * tiene nada que hacer en utf8mb4. `ascii_bin` porque un identificador opaco
 * compara exacto — `randomUUID()` siempre emite minúsculas, así que no hay
 * ambigüedad que tolerar, y una sola grafía por recurso mantiene limpios la
 * caché y los logs.
 *
 * UNIQUE plano, a diferencia de `business_units`
 * (`1787932877000000_add_slug_active_unique_to_business_units.ts`), que usa
 * columna generada VIRTUAL para que un borrado lógico libere el slug. Ahí hacía
 * falta porque el slug se derivaba del nombre y dos empresas podían querer el
 * mismo. Un UUID nunca se quiere reutilizar: que el slug de un empleado dado de
 * baja quede ocupado para siempre es justo lo que se busca.
 *
 * El backfill genera los tokens con `randomUUID()` (UUIDv4) y NO con la función
 * `UUID()` de MySQL, que emite **v1**: 60 bits de timestamp más la dirección MAC
 * del servidor. Un v1 es adivinable por proximidad temporal y filtra hardware —
 * exactamente lo que este cambio busca evitar — así que usarlo en el relleno
 * dejaría a todos los empleados preexistentes con un token débil mientras los
 * nuevos nacen con uno fuerte.
 *
 * Tampoco se usa v7, que es la versión más reciente: lleva un timestamp de 48
 * bits al frente y es ordenable por tiempo. Eso lo hace bueno como clave
 * primaria (localidad de índice) y malo como identificador público, porque
 * revela cuándo se dio de alta cada empleado y permite inferir el orden y el
 * volumen de contrataciones comparando dos tokens. Para un token opaco se
 * quiere v4: 122 bits de aleatoriedad y nada más.
 *
 * El backfill va con `this.defer` registrado ANTES del DDL: en MySQL cada
 * `ALTER TABLE` hace commit implícito y no se revierte, así que si el relleno
 * corriera después, aplicar `NOT NULL` sobre filas con slug nulo dejaría la
 * tabla a medias.
 */

const TABLE = 'employees'
const COLUMN = 'employee_slug'
const INDEX = 'employees_slug_unique'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — relleno de las filas existentes (ANTES de cualquier DDL).
    //
    // Se reemplaza todo lo que no sea ya un UUIDv4: los nulos, los slugs
    // derivados viejos (`nombre---codigo---id`) y cualquier token de otra
    // versión, incluidos los v1 que dejaría un backfill hecho con `UUID()` de
    // MySQL. El criterio mira el nibble de versión, que en la forma canónica
    // es el carácter 15.
    //
    // Fila por fila y en lotes porque el valor lo genera Node: es la misma
    // fuente que el hook `beforeCreate` del modelo, de modo que "qué es un
    // slug" se define en un solo lugar.
    this.defer(async (db) => {
      const BATCH_SIZE = 500
      const notV4 =
        `\`${COLUMN}\` IS NULL
         OR \`${COLUMN}\` = ''
         OR CHAR_LENGTH(\`${COLUMN}\`) <> 36
         OR SUBSTRING(\`${COLUMN}\`, 15, 1) <> '4'`

      for (;;) {
        const [rows] = await db.rawQuery<[Array<{ employee_id: number }>]>(
          `SELECT \`employee_id\`
           FROM \`${TABLE}\`
           WHERE ${notV4}
           LIMIT ${BATCH_SIZE}`
        )

        if (rows.length === 0) {
          break
        }

        for (const row of rows) {
          await db.rawQuery(
            `UPDATE \`${TABLE}\` SET \`${COLUMN}\` = ? WHERE \`employee_id\` = ?`,
            [randomUUID(), row.employee_id]
          )
        }
      }
    })

    // Paso 2 — acotar el tipo para poder indexarlo sin un índice de 1020 bytes.
    this.schema.raw(
      `ALTER TABLE \`${TABLE}\`
       MODIFY \`${COLUMN}\` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`
    )

    // Paso 3 — UNIQUE plano sobre el token.
    this.schema.raw(`ALTER TABLE \`${TABLE}\` ADD UNIQUE KEY \`${INDEX}\` (\`${COLUMN}\`)`)
  }

  async down() {
    // Tolerante a estado parcial: el up() puede haber abortado entre los dos
    // ALTER, y en MySQL el primero ya quedó commiteado.
    this.defer(async (db) => {
      type CountRow = { cnt: number }

      const [idxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = '${INDEX}'`
      )
      if ((idxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``)
      }

      await db.rawQuery(
        `ALTER TABLE \`${TABLE}\` MODIFY \`${COLUMN}\` VARCHAR(255) NULL`
      )
    })
  }
}
