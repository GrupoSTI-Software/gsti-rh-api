import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786566437097 — M3: endurecimiento post-deploy de `assists.business_unit_id`.
 * Corre minutos después del deploy (código con hooks fail-closed ya en producción).
 * Requiere residuo cuarentenado = 0; si no, aborta antes del MODIFY (regla 15).
 *
 * El índice `assists_business_unit_id_index` lo crea M1; aquí solo NOT NULL + FK.
 * Evidencia CA-24: database/migration_evidence/USRH1786566437097/
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.defer(async (db) => {
      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS nulls FROM \`${this.tableName}\` WHERE \`business_unit_id\` IS NULL`
      )
      const nullCount = Number(rows?.[0]?.nulls ?? 0)

      if (nullCount > 0) {
        throw new Error(
          `assists: ${nullCount} fila(s) con business_unit_id NULL (cuarentena). ` +
            'Resolver con regla 15 o resolución manual documentada antes de M3. ' +
            'Ejecutar: node ace assist:migration-evidence --step=pre-m3'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD CONSTRAINT \`assists_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)
           ON DELETE RESTRICT ON UPDATE RESTRICT`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\` DROP FOREIGN KEY \`assists_business_unit_id_foreign\``
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\` MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NULL`
      )
    })
  }
}
