import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Dueño por empresa en `roles` y candado de identidad por empresa.
 *
 * Por qué: el slug de un rol se deriva de su nombre (`RoleService`) y el
 * candado que puso `1789145449678` es GLOBAL (`roles_slug_active_unique` sobre
 * `role_slug_active`). Con varios clientes en la misma base, el segundo que
 * cree "Recursos Humanos" choca contra el índice de un rol que no es suyo y
 * que ni siquiera puede ver. La identidad de un rol deja de ser el slug y pasa
 * a ser el par (empresa, slug).
 *
 * `business_unit_id` entra NULLABLE y la migración NO toca datos:
 *  - NULL = rol global de plataforma (`root`) o de sistema (`owner`,
 *    `empleado`, ver `app/constants/system_roles.ts`), visibles en todo tenant.
 *  - NULL también es, de momento, el estado de los roles heredados de cada
 *    cliente, que hoy se distinguen por el CSV `role_business_access`. El
 *    código mantiene esa compatibilidad temporal mientras no corra el backfill
 *    (ver `app/helpers/role_business_scope.ts`).
 *
 * Patrón columna generada + UNIQUE, el mismo de `1789145449678`: un UNIQUE
 * plano dejaría el slug ocupado para siempre al dar de baja lógica una fila.
 * Aquí se suman dos columnas generadas:
 *  - `role_business_unit_key` = `IFNULL(business_unit_id, 0)`, porque en un
 *    UNIQUE de MySQL cada NULL cuenta como distinto y los roles globales
 *    quedarían sin candado entre ellos; el 0 los mete a todos en un mismo
 *    cajón, que es justo el comportamiento que tenían.
 *  - `role_slug_active`, que ya existía, se ensancha de VARCHAR(100) a
 *    VARCHAR(150) para igualar a `role_slug` (`1716910169928`): un slug de más
 *    de 100 caracteres quedaba fuera del candado o lo hacía fallar.
 *
 * Las tres sentencias del candado van separadas y en este orden —DROP INDEX,
 * MODIFY, ADD UNIQUE— porque MySQL no permite modificar una columna generada
 * mientras un índice la sostiene, y porque una sola sentencia combinada no
 * está verificada en la versión de producción.
 *
 * El pre-check va registrado con `this.defer` PRIMERO para correr antes de
 * cualquier DDL: en MySQL cada `ALTER TABLE` hace commit implícito y no se
 * revierte, así que abortar después dejaría la tabla a medias.
 */

const ROLES_TABLE = 'roles'
const BUSINESS_UNITS_TABLE = 'business_units'
const BUSINESS_UNIT_ID = 'business_unit_id'
const BUSINESS_UNIT_KEY = 'role_business_unit_key'
const ROLE_SLUG = 'role_slug'
const ROLE_SLUG_ACTIVE = 'role_slug_active'
const ROLE_DELETED_AT = 'role_deleted_at'
const OLD_INDEX = 'roles_slug_active_unique'
const NEW_INDEX = 'roles_business_unit_slug_active_unique'
const BUSINESS_UNIT_INDEX = 'roles_business_unit_id_index'
const BUSINESS_UNIT_FK = 'roles_business_unit_id_foreign'

/** Mismo largo que `roles.role_slug` (VARCHAR(150), migración 1716910169928). */
const SLUG_LENGTH = 150

/** Expresión de `role_slug_active`: el slug real en las vivas, NULL en las retiradas. */
const SLUG_ACTIVE_EXPRESSION = `CASE WHEN \`${ROLE_DELETED_AT}\` IS NULL THEN \`${ROLE_SLUG}\` ELSE NULL END`

type CountRow = { cnt: number }
type RoleDupRow = { slug: string; total: number; roles: string }

export default class extends BaseSchema {
  async up() {
    // Paso 0 — pre-check, ANTES de cualquier DDL.
    //
    // La columna todavía no existe, así que todas las filas vivas caen en el
    // mismo cajón (`IFNULL(NULL, 0)` = 0) y comprobar el par (empresa, slug)
    // equivale a comprobar el slug a secas. Si el candado global de
    // `1789145449678` no está puesto, la base no está donde esta migración
    // supone y se aborta en lugar de crear un índice sobre datos sucios.
    this.defer(async (db) => {
      const [indexRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND index_name = ?`,
        [ROLES_TABLE, OLD_INDEX]
      )
      if ((indexRows[0]?.cnt ?? 0) === 0) {
        throw new Error(
          `[USRH1789528501204] Falta el índice \`${OLD_INDEX}\` en \`${ROLES_TABLE}\`: ` +
            'corre antes la migración 1789145449678 (candado de identidad del catálogo).'
        )
      }

      const [roleDups] = await db.rawQuery<[RoleDupRow[]]>(
        `SELECT
           \`${ROLE_SLUG}\` AS slug,
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT(\`role_id\`, ' (', \`role_name\`, ')')
             ORDER BY \`role_id\`
             SEPARATOR ', '
           ) AS roles
         FROM \`${ROLES_TABLE}\`
         WHERE \`${ROLE_DELETED_AT}\` IS NULL
         GROUP BY \`${ROLE_SLUG}\`
         HAVING COUNT(*) > 1
         ORDER BY \`${ROLE_SLUG}\` ASC`
      )

      if (roleDups.length > 0) {
        throw new Error(
          '[USRH1789528501204] Roles vivos compartiendo slug — resolver antes de poner el ' +
            'candado por empresa:\n' +
            roleDups.map((row) => `  - "${row.slug}" x${row.total} -> ids ${row.roles}`).join('\n')
        )
      }
    })

    // Paso 1 — dueño por empresa. RESTRICT (el default de Knex): una empresa
    // con roles propios no se borra por accidente desde la BD.
    this.schema.alterTable(ROLES_TABLE, (table) => {
      table.integer(BUSINESS_UNIT_ID).unsigned().nullable().after(ROLE_SLUG)
      table.index([BUSINESS_UNIT_ID], BUSINESS_UNIT_INDEX)
      table
        .foreign(BUSINESS_UNIT_ID, BUSINESS_UNIT_FK)
        .references(BUSINESS_UNIT_ID)
        .inTable(BUSINESS_UNITS_TABLE)
    })

    // Paso 2 — cajón de empresa para el UNIQUE: los globales comparten el 0.
    this.schema.raw(`
      ALTER TABLE \`${ROLES_TABLE}\`
      ADD COLUMN \`${BUSINESS_UNIT_KEY}\` INT UNSIGNED
        GENERATED ALWAYS AS (IFNULL(\`${BUSINESS_UNIT_ID}\`, 0)) VIRTUAL
        AFTER \`${BUSINESS_UNIT_ID}\`
    `)

    // Paso 3 — el candado global sale, la columna generada se ensancha y entra
    // el candado por empresa. En este orden: MySQL no deja modificar una
    // columna generada que sostiene un índice.
    this.schema.raw(`ALTER TABLE \`${ROLES_TABLE}\` DROP INDEX \`${OLD_INDEX}\``)

    this.schema.raw(`
      ALTER TABLE \`${ROLES_TABLE}\`
      MODIFY COLUMN \`${ROLE_SLUG_ACTIVE}\` VARCHAR(${SLUG_LENGTH})
        GENERATED ALWAYS AS (${SLUG_ACTIVE_EXPRESSION}) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`${ROLES_TABLE}\`
      ADD UNIQUE KEY \`${NEW_INDEX}\` (\`${BUSINESS_UNIT_KEY}\`, \`${ROLE_SLUG_ACTIVE}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: consulta information_schema antes de cada
    // paso para que el rollback funcione aunque `up()` haya abortado a media
    // (molde: 1789145449678:262-320).
    //
    // `role_slug_active` se queda en VARCHAR(150): estrecharlo otra vez a 100
    // rompería cualquier fila cuyo slug pase de 100 caracteres, y el ancho no
    // depende de esta migración.
    this.defer(async (db) => {
      const indexExists = async (index: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND index_name = ?`,
          [ROLES_TABLE, index]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      const columnExists = async (column: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND column_name = ?`,
          [ROLES_TABLE, column]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      const constraintExists = async (constraint: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.TABLE_CONSTRAINTS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND constraint_name = ?`,
          [ROLES_TABLE, constraint]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      if (await indexExists(NEW_INDEX)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP INDEX \`${NEW_INDEX}\``)
      }

      if (!(await indexExists(OLD_INDEX))) {
        // El candado global no puede volver si dos empresas ya se llaman
        // igual: se aborta y el rollback queda solo de código.
        const [roleDups] = await db.rawQuery<[RoleDupRow[]]>(
          `SELECT
             \`${ROLE_SLUG}\` AS slug,
             COUNT(*) AS total,
             GROUP_CONCAT(
               CONCAT(\`role_id\`, ' (', \`role_name\`, ')')
               ORDER BY \`role_id\`
               SEPARATOR ', '
             ) AS roles
           FROM \`${ROLES_TABLE}\`
           WHERE \`${ROLE_DELETED_AT}\` IS NULL
           GROUP BY \`${ROLE_SLUG}\`
           HAVING COUNT(*) > 1
           ORDER BY \`${ROLE_SLUG}\` ASC`
        )
        if (roleDups.length > 0) {
          throw new Error(
            '[USRH1789528501204] No se puede restaurar el candado global de slugs: hay roles ' +
              'vivos de empresas distintas con el mismo slug:\n' +
              roleDups.map((row) => `  - "${row.slug}" x${row.total} -> ids ${row.roles}`).join('\n')
          )
        }

        await db.rawQuery(
          `ALTER TABLE \`${ROLES_TABLE}\` ADD UNIQUE KEY \`${OLD_INDEX}\` (\`${ROLE_SLUG_ACTIVE}\`)`
        )
      }

      if (await columnExists(BUSINESS_UNIT_KEY)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP COLUMN \`${BUSINESS_UNIT_KEY}\``)
      }

      // La FK sale antes que su índice y su columna.
      if (await constraintExists(BUSINESS_UNIT_FK)) {
        await db.rawQuery(
          `ALTER TABLE \`${ROLES_TABLE}\` DROP FOREIGN KEY \`${BUSINESS_UNIT_FK}\``
        )
      }
      if (await indexExists(BUSINESS_UNIT_INDEX)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP INDEX \`${BUSINESS_UNIT_INDEX}\``)
      }
      if (await columnExists(BUSINESS_UNIT_ID)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP COLUMN \`${BUSINESS_UNIT_ID}\``)
      }
    })
  }
}
