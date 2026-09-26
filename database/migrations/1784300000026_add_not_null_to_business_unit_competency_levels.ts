import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1784259058567) — `business_unit_competency_levels`
 * ya tenía `business_unit_id` poblada, pero como columna NULLABLE. Pre-check
 * corrido al implementar (0 filas con NULL) → se impone NOT NULL para poder
 * componer `withBusinessUnitScope()` con garantía. Si en el futuro apareciera
 * una fila con `business_unit_id IS NULL`, esta migración aborta con un
 * mensaje claro en vez de forzar el NOT NULL a ciegas (no hay padre del cual
 * derivar la pertenencia — decisión: escalar a Wilvardo, no inventar).
 */
export default class extends BaseSchema {
  protected tableName = 'business_unit_competency_levels'

  async up() {
    this.defer(async (db) => {
      const nullRows = await db.rawQuery(
        `SELECT COUNT(*) AS nulls FROM \`${this.tableName}\` WHERE \`business_unit_id\` IS NULL`
      )
      const nullCount = Number(nullRows?.[0]?.[0]?.nulls ?? 0)

      if (nullCount > 0) {
        throw new Error(
          `business_unit_competency_levels: ${nullCount} fila(s) con business_unit_id NULL — ` +
            'no hay padre del cual derivar la pertenencia. Escalar a Wilvardo antes de forzar NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\` MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().alter()
    })
  }
}
