import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de grupos de módulos — migración A (USRH1788282413065).
 *
 * Crea `system_module_groups` con sus 8 columnas reales, la columna generada
 * VIRTUAL para el UNIQUE con baja lógica (patrón de
 * 1787932877000000_add_slug_active_unique_to_business_units.ts:82-98) y el
 * índice de orden.  Inserta las 9 filas literales de §4.1 con `icon = NULL`.
 *
 * Las filas van en esta migración —no en un seeder— por dos razones:
 * la migración B necesita filas a las que apuntar, y un ambiente productivo
 * migrado no corre seeders.  El WHERE NOT EXISTS da la reentrancia del CA7.
 *
 * IMPORTANTE: esta lista está congelada al 2026-09-01.  No se importa
 * ninguna constante viva: una migración es un hecho histórico inmutable, y si
 * importara una constante editable el catálogo cambiaría el comportamiento de
 * una migración vieja al levantar desde cero.
 */

const TABLE = 'system_module_groups'
const KEY_COL = 'system_module_group_key'
const KEY_ACTIVE_COL = 'system_module_group_key_active'
const DELETED_AT = 'system_module_group_deleted_at'
const UNIQUE_KEY = 'uq_system_module_group_key_active'
const ORDER_IDX = 'idx_system_module_group_order'

type GroupRow = { name: string; key: string; order: number }

/** Tabla de conversión congelada §4.1 — desempates de prefijo ya resueltos. */
const GROUPS: GroupRow[] = [
  { name: 'Reportes',        key: 'reportes',        order: 10 },
  { name: 'Empresa',         key: 'empresa',         order: 20 },
  { name: 'Calendarios',     key: 'calendarios',     order: 30 },
  { name: 'Configuraciones', key: 'configuraciones', order: 40 },
  { name: 'NOM-035',         key: 'nom-035',         order: 50 },
  { name: 'Otros',           key: 'otros',           order: 60 },
  { name: 'ZKSync',          key: 'zksync',          order: 70 },
  { name: 'NOM-037',         key: 'nom-037',         order: 80 },
  { name: 'Plataforma',      key: 'plataforma',      order: 90 },
]

export default class extends BaseSchema {
  async up() {
    // A1 — crear tabla con las 8 columnas reales.
    // `increments` = INT UNSIGNED, igual que system_modules.system_module_id.
    // Timestamps prefijados por tabla (convención de system_modules, §9.1).
    this.schema.createTable(TABLE, (table) => {
      table.increments('system_module_group_id')
      table.string('system_module_group_name', 45).notNullable()
      table.string('system_module_group_key', 45).notNullable()
      table.text('system_module_group_icon').nullable()
      table.smallint('system_module_group_order').unsigned().notNullable()
      table.timestamp('system_module_group_created_at').notNullable()
      table.timestamp('system_module_group_updated_at').nullable()
      table.timestamp('system_module_group_deleted_at').nullable()
    })

    // A2 — columna generada VIRTUAL: clave en filas vivas, NULL en dadas de baja.
    // Knex no expone generatedAs VIRTUAL en MySQL → this.schema.raw
    // (razón textual en 1787932877000000:15-17).
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD COLUMN \`${KEY_ACTIVE_COL}\` VARCHAR(45)
        GENERATED ALWAYS AS (
          CASE WHEN \`${DELETED_AT}\` IS NULL
               THEN \`${KEY_COL}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    // A3 — UNIQUE sobre la columna generada.
    // MySQL trata cada NULL como distinto: N grupos dados de baja con la
    // misma clave conviven sin error; dos vivos no pueden (regla 2).
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD UNIQUE KEY \`${UNIQUE_KEY}\` (\`${KEY_ACTIVE_COL}\`)
    `)

    // A4 — índice de orden (sostiene ORDER BY de los tres endpoints que
    // rehará "Servir los módulos con su grupo y su orden desde el API").
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD INDEX \`${ORDER_IDX}\` (\`system_module_group_order\`)
    `)

    // A5 — insertar las 9 filas literales con reentrancia (CA7).
    // WHERE NOT EXISTS garantiza que una segunda ejecución no duplica filas.
    this.defer(async (db) => {
      for (const g of GROUPS) {
        await db.rawQuery(
          `INSERT INTO \`${TABLE}\`
             (system_module_group_name, system_module_group_key,
              system_module_group_icon, system_module_group_order,
              system_module_group_created_at)
           SELECT ?, ?, NULL, ?, NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM \`${TABLE}\`
             WHERE \`${KEY_COL}\` = ?
               AND \`${DELETED_AT}\` IS NULL
           )`,
          [g.name, g.key, g.order, g.key]
        )
      }
    })
  }

  async down() {
    // Arrastra la columna generada y el UNIQUE consigo. Reversible sin residuo.
    this.schema.dropTable(TABLE)
  }
}
