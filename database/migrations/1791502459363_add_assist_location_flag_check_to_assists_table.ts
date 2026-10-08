import { BaseSchema } from '@adonisjs/lucid/schema'

/** Nombre explícito: el `down` lo quita por nombre. */
const CHECK_NAME = 'assists_location_flag_check'
const COLUMN = 'assist_location_flag'
/** Vocabulario de `ASSIST_LOCATION_FLAG` al momento de esta migración. */
const ALLOWED_FLAGS = ['simulated', 'unverified'] as const

/**
 * Restringe `assists.assist_location_flag` al vocabulario cerrado de
 * `ASSIST_LOCATION_FLAG` (`app/constants/assist_location_flag.ts`): `simulated`,
 * `unverified` o NULL (VLRH-H1791056345261).
 *
 * La columna se creó como `varchar(20)` para que el ALTER fuera instantáneo
 * (`1791406751758_add_assist_location_flag_to_assists_table.ts`); un ENUM obligaría
 * a reconstruir la tabla por cada valor nuevo. El CHECK da la misma garantía y
 * agregar un valor solo cambia la restricción.
 *
 * Los literales se congelan aquí a propósito: una migración describe el esquema
 * de su momento. Un valor nuevo en la constante exige otra migración, y
 * `tests/functional/assist_location_flag_check.spec.ts` lo detecta.
 *
 * Compara en binario: la columna es `utf8mb4_unicode_ci` y, sin el COLLATE,
 * `SIMULATED` pasaría el IN aunque el backoffice no lo reconoce.
 *
 * Requiere MySQL 8.0.16+: las versiones anteriores aceptan el CHECK y no lo
 * aplican. Al agregarse, MySQL valida las filas existentes.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    const allowed = ALLOWED_FLAGS.map((flag) => `'${flag}'`).join(', ')
    this.schema.raw(
      `ALTER TABLE \`${this.tableName}\` ADD CONSTRAINT \`${CHECK_NAME}\` ` +
        `CHECK (\`${COLUMN}\` IS NULL OR \`${COLUMN}\` COLLATE utf8mb4_bin IN (${allowed}))`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE \`${this.tableName}\` DROP CHECK \`${CHECK_NAME}\``)
  }
}
