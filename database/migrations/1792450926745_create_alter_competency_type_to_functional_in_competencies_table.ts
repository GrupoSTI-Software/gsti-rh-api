import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1792026430212 — Renombrar `transversal` a `functional` en el enum
 * `competency_type` de la tabla `competencies`.
 *
 * El valor `functional` ya es el estándar en `position_competencies` desde
 * la migración 1774303820198. El catálogo adoptaba `transversal` por error.
 *
 * Guarda (up/down): si existe alguna fila con el valor que se va a eliminar,
 * la migración aborta SIN alterar nada. La base de producción está limpia
 * por decisión de Wilvardo (2026-10-16). En bases de desarrollo o sae_pruebas
 * que tengan filas de corridas anteriores se pasan a `functional` a mano
 * antes de migrar.
 *
 * Sin UPDATE: la migración no convierte datos (decisión de Wilvardo, §13).
 */
export default class extends BaseSchema {
  protected tableName = 'competencies'

  async up() {
    const [rows] = await this.db.rawQuery(
      `SELECT COUNT(*) as total FROM ${this.tableName} WHERE competency_type = 'transversal'`
    )
    const total = Number(rows[0]?.total ?? 0)
    if (total > 0) {
      throw new Error(
        `VLRH-H1792026430212: hay ${total} fila(s) con competency_type = 'transversal'. Pasalas a functional a mano antes de correr esta migracion.`
      )
    }

    this.schema.raw(
      `ALTER TABLE ${this.tableName} MODIFY competency_type ENUM('technical','functional') NOT NULL`
    )
  }

  async down() {
    const [rows] = await this.db.rawQuery(
      `SELECT COUNT(*) as total FROM ${this.tableName} WHERE competency_type = 'functional'`
    )
    const total = Number(rows[0]?.total ?? 0)
    if (total > 0) {
      throw new Error(
        `VLRH-H1792026430212 (rollback): hay ${total} fila(s) con competency_type = 'functional'. Pasalas a transversal a mano antes de hacer rollback.`
      )
    }

    this.schema.raw(
      `ALTER TABLE ${this.tableName} MODIFY competency_type ENUM('technical','transversal') NOT NULL`
    )
  }
}
