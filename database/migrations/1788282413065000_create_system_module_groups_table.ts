import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de grupos de módulos — migración A (USRH1788282413065).
 *
 * Crea `system_module_groups` con sus 8 columnas reales, la columna generada
 * VIRTUAL para el UNIQUE con baja lógica (patrón de
 * 1787932877000000_add_slug_active_unique_to_business_units.ts:82-98) y el
 * índice de orden. Solo esquema: no inserta filas.
 *
 * Originalmente también insertaba los grupos del menú. Ese `INSERT` se retiró
 * porque las migraciones ya no siembran catálogo: los grupos se declaran en
 * `app/constants/system_modules_menu/system_modules.constant.ts` y los crea
 * `0061_system_module_group_seeder`, resueltos por clave.
 */

const TABLE = 'system_module_groups'
const KEY_COL = 'system_module_group_key'
const KEY_ACTIVE_COL = 'system_module_group_key_active'
const DELETED_AT = 'system_module_group_deleted_at'
const UNIQUE_KEY = 'uq_system_module_group_key_active'
const ORDER_IDX = 'idx_system_module_group_order'

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
  }

  async down() {
    // Arrastra la columna generada y el UNIQUE consigo. Reversible sin residuo.
    this.schema.dropTable(TABLE)
  }
}
