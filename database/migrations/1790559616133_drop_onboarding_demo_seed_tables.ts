import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Baja de la siembra demo del onboarding (USRH1789079078168).
 *
 * Retira la constancia pieza por pieza (`onboarding_seeded_records`) y las dos
 * marcas de ciclo de vida de `onboarding_user_states`. El código que las
 * escribía y leía (demo_seed, purga diaria, anti-join de hitos) sale en el
 * mismo PR.
 *
 * Fail-closed: si queda alguna siembra viva (filas de constancia, estados
 * sembrados sin limpiar o usuarios demo vivos) aborta ANTES de cualquier DDL
 * —en MySQL cada DDL hace commit implícito— y lista solo las empresas
 * afectadas (id:nombre). Idempotente: cada paso consulta information_schema.
 *
 * **Nota de implementación (drift confirmado contra el Anexo B):** el
 * precheck se resuelve con `await` directo dentro de `up()`/`down()` —NUNCA
 * dentro de `this.defer()`— y las sentencias destructivas reales corren por
 * `this.schema.raw()` (mismo patrón que `1789700200000` y `1789700300000`),
 * no por `db.rawQuery()` crudo dentro de un `defer`. Verificado
 * empíricamente: correr esas sentencias vía `db.rawQuery()` dentro de
 * `this.defer()` sí las aplica (commit implícito de MySQL), pero el
 * `INSERT` de bookkeeping que el runner de Lucid hace después
 * (`adonis_schema`) corre sobre el mismo cliente-transacción ya comprometido
 * por ese commit implícito y no queda registrado — la migración vuelve a
 * "pending" aunque ya se aplicó. Las dos migraciones precedentes citadas por
 * el spec evitan esto porque corren por `this.schema.xxx` (fuera de
 * `defer`), nunca por `db.rawQuery()` dentro de uno. Aquí se sigue ese mismo
 * patrón para las dos únicas migraciones reales del repo con precheck + DDL
 * condicional.
 */

const SEEDED_TABLE = 'onboarding_seeded_records'
const STATES_TABLE = 'onboarding_user_states'
const SEEDED_AT = 'onboarding_user_state_demo_seeded_at'
const CLEANED_AT = 'onboarding_user_state_demo_cleaned_at'
const DEMO_EMAIL_PATTERN = 'demo+bu%@onboarding.valanserh.invalid'

const ERROR_TITLE = 'No se puede dar de baja la siembra demo'
const ERROR_KEY = 'no-se-puede-dar-de-baja-la-siembra-demo'

type CountRow = { cnt: number }
type TenantRow = { tenants: string | null; total: number }

export default class extends BaseSchema {
  async up() {
    const count = async (sql: string, bindings: string[]): Promise<number> => {
      const [rows] = await this.db.rawQuery<[CountRow[]]>(sql, bindings)
      return rows[0]?.cnt ?? 0
    }
    const tableExists = (table: string) =>
      count(
        `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      ).then((n) => n > 0)
    const columnExists = (table: string, column: string) =>
      count(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
      ).then((n) => n > 0)
    const tenantsOf = async (sql: string, bindings: string[] = []): Promise<TenantRow> => {
      const [rows] = await this.db.rawQuery<[TenantRow[]]>(sql, bindings)
      return rows[0] ?? { tenants: null, total: 0 }
    }

    const hasTable = await tableExists(SEEDED_TABLE)
    const hasColumns = await columnExists(STATES_TABLE, SEEDED_AT)
    const offenders: string[] = []

    // (a) Filas de constancia: el tenant es el SNAPSHOT de la propia fila.
    if (hasTable) {
      const a = await tenantsOf(
        `SELECT COUNT(*) AS total,
                GROUP_CONCAT(DISTINCT CONCAT(osr.business_unit_id, ':',
                  COALESCE(bu.business_unit_name, '(empresa inexistente)'))
                  ORDER BY osr.business_unit_id SEPARATOR ' | ') AS tenants
         FROM \`${SEEDED_TABLE}\` osr
         LEFT JOIN business_units bu ON bu.business_unit_id = osr.business_unit_id`
      )
      if (a.total > 0) offenders.push(`(a) ${a.total} fila(s) sembradas en: ${a.tenants}`)
    }

    // (b) Estados con siembra viva: no guardan BU; se listan las membresías
    //     vivas del usuario. Nunca se imprime el id de estado ni el user_id.
    if (hasColumns) {
      const b = await tenantsOf(
        `SELECT COUNT(DISTINCT s.onboarding_user_state_id) AS total,
                GROUP_CONCAT(DISTINCT CONCAT(bu.business_unit_id, ':', bu.business_unit_name)
                  ORDER BY bu.business_unit_id SEPARATOR ' | ') AS tenants
         FROM \`${STATES_TABLE}\` s
         LEFT JOIN business_unit_users buu
                ON buu.user_id = s.user_id AND buu.business_unit_user_deleted_at IS NULL
         LEFT JOIN business_units bu ON bu.business_unit_id = buu.business_unit_id
         WHERE s.\`${SEEDED_AT}\` IS NOT NULL AND s.\`${CLEANED_AT}\` IS NULL`
      )
      if (b.total > 0) {
        offenders.push(`(b) ${b.total} siembra(s) sin limpiar en: ${b.tenants ?? '(sin empresa viva)'}`)
      }
    }

    // (c) Usuarios demo vivos por patrón de correo: independiente de la tabla,
    //     atrapa cuentas que perdieron su constancia. Nunca se imprime el correo.
    const c = await tenantsOf(
      `SELECT COUNT(DISTINCT u.user_id) AS total,
              GROUP_CONCAT(DISTINCT CONCAT(bu.business_unit_id, ':', bu.business_unit_name)
                ORDER BY bu.business_unit_id SEPARATOR ' | ') AS tenants
       FROM users u
       LEFT JOIN business_unit_users buu
              ON buu.user_id = u.user_id AND buu.business_unit_user_deleted_at IS NULL
       LEFT JOIN business_units bu ON bu.business_unit_id = buu.business_unit_id
       WHERE u.user_email LIKE ? AND u.user_deleted_at IS NULL`,
      [DEMO_EMAIL_PATTERN]
    )
    if (c.total > 0) {
      offenders.push(`(c) ${c.total} usuario(s) demo vivos en: ${c.tenants ?? '(sin empresa viva)'}`)
    }

    if (offenders.length > 0) {
      // Sin `this.schema.raw()` registrado todavía: nada de DDL se ejecuta.
      this.defer(async () => {
        throw new Error(
          `[USRH1789079078168] ${ERROR_KEY}: ${ERROR_TITLE} mientras queden siembras vivas.\n` +
            offenders.map((o) => `  - ${o}`).join('\n') +
            '\nProducción: no desplegar; decisión de Wilvardo (spec §17 R-1). ' +
            'BD local o de pruebas: acuse manual del Anexo C §3 y re-correr migration:run.'
        )
      })
      return
    }

    // Hija primero: arrastra sus 2 FKs y sus 2 índices con nombre. DDL vía
    // `this.schema.raw()` (no `db.rawQuery()` dentro de `defer`): así el
    // runner registra la migración en `adonis_schema` correctamente (ver nota
    // de implementación arriba).
    if (hasTable) {
      this.schema.raw(`DROP TABLE \`${SEEDED_TABLE}\``)
    }

    // Un solo ALTER para ambas columnas.
    if (hasColumns) {
      this.schema.raw(
        `ALTER TABLE \`${STATES_TABLE}\` DROP COLUMN \`${SEEDED_AT}\`, DROP COLUMN \`${CLEANED_AT}\``
      )
    }
  }

  /**
   * Recrea la ESTRUCTURA vacía (idéntica a 1785444100000:18-55 y
   * 1785444100001:13-16). Los datos no vuelven (RN-11): el precheck de `up()`
   * garantizó que no había ninguno vivo al subir. Idempotente: cada paso se
   * guarda con `information_schema`, resuelto con `await` directo (mismo
   * motivo que en `up()`); el DDL corre por `this.schema.raw()`.
   */
  async down() {
    const count = async (sql: string, bindings: string[]): Promise<number> => {
      const [rows] = await this.db.rawQuery<[CountRow[]]>(sql, bindings)
      return rows[0]?.cnt ?? 0
    }
    const columnExists = (table: string, column: string) =>
      count(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
      ).then((n) => n > 0)
    const tableExists = (table: string) =>
      count(
        `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
      ).then((n) => n > 0)

    const hasColumns = await columnExists(STATES_TABLE, SEEDED_AT)
    if (!hasColumns) {
      this.schema.raw(
        `ALTER TABLE \`${STATES_TABLE}\`
           ADD COLUMN \`${SEEDED_AT}\` TIMESTAMP NULL,
           ADD COLUMN \`${CLEANED_AT}\` TIMESTAMP NULL`
      )
    }

    const hasTable = await tableExists(SEEDED_TABLE)
    if (!hasTable) {
      this.schema.raw(`
        CREATE TABLE \`${SEEDED_TABLE}\` (
          \`onboarding_seeded_record_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`onboarding_user_state_id\` INT UNSIGNED NOT NULL,
          \`business_unit_id\` INT UNSIGNED NOT NULL,
          \`onboarding_seeded_record_entity_type\` VARCHAR(60) NOT NULL,
          \`onboarding_seeded_record_entity_id\` INT UNSIGNED NOT NULL,
          \`onboarding_seeded_record_created_at\` TIMESTAMP NOT NULL,
          PRIMARY KEY (\`onboarding_seeded_record_id\`),
          UNIQUE KEY \`onboarding_seeded_records_entity_unique\`
            (\`onboarding_user_state_id\`, \`onboarding_seeded_record_entity_type\`, \`onboarding_seeded_record_entity_id\`),
          KEY \`onboarding_seeded_records_entity_lookup\`
            (\`onboarding_seeded_record_entity_type\`, \`onboarding_seeded_record_entity_id\`),
          CONSTRAINT \`onboarding_seeded_records_onboarding_user_state_id_foreign\`
            FOREIGN KEY (\`onboarding_user_state_id\`) REFERENCES \`${STATES_TABLE}\` (\`onboarding_user_state_id\`) ON DELETE CASCADE,
          CONSTRAINT \`onboarding_seeded_records_business_unit_id_foreign\`
            FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    }
  }
}
