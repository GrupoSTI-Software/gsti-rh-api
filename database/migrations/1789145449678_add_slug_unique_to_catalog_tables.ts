import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Candado de identidad del catálogo: roles, módulos y permisos.
 *
 * `system_module_id` se declara `table.increments()` (autoincremental) pero 16
 * seeders escriben el id a mano y hacen `updateOrCreate` por ese id. Cuando dos
 * reclaman el mismo número el segundo no falla: sobrescribe al primero en
 * silencio. Así desaparecieron cinco módulos —complaints, consent-evidence,
 * legal-documents, telework-workers y calendar— y quedó un permiso duplicado
 * (módulo 46 con dos slugs `read`). `roles` tiene el mismo defecto: la
 * migración 1788500000000 crea `kiosco` sin id y sobre una base vacía toma el
 * 1, con lo que `0006_role_seeder` da por existente al rol 1 y nunca crea
 * `super-administrador`.

 * Este candado NO impide la sobrescritura por id —una fila a la que le cambian
 * el slug no viola ningún UNIQUE—; eso lo cura que los seeders resuelvan por
 * slug. Lo que impide es la otra mitad del defecto: dos filas vivas
 * compartiendo identidad.
 *
 * Esta migración hace la colisión físicamente imposible: la identidad pasa a
 * ser el slug y MySQL lo obliga.
 *
 * Patrón columna generada + UNIQUE, nunca UNIQUE plano: un UNIQUE plano
 * dejaría el slug ocupado para siempre al dar de baja lógica una fila, que
 * conserva su valor. La columna generada devuelve NULL en las dadas de baja y
 * MySQL trata cada NULL como distinto, así que N filas retiradas con el mismo
 * slug conviven y dos vivas no pueden. Molde:
 * database/migrations/1787932877000000_add_slug_active_unique_to_business_units.ts
 *
 * Se crean con `this.schema.raw` y no dentro de `alterTable` porque Knex no
 * expone `generatedAs` para columnas virtuales en MySQL.
 *
 * El pre-check va registrado con `this.defer` PRIMERO para correr antes de
 * cualquier DDL: en MySQL cada `ALTER TABLE` hace commit implícito y no se
 * revierte, así que un abort posterior dejaría las tablas a medias.
 *
 * Depende de 1789145447080_recover_lost_system_modules, que repara el
 * duplicado vivo. Sin esa reparación previa el pre-check de aquí aborta.
 */

const ROLES_TABLE = 'roles'
const ROLE_SLUG = 'role_slug'
const ROLE_SLUG_ACTIVE = 'role_slug_active'
const ROLE_DELETED_AT = 'role_deleted_at'
const ROLE_INDEX = 'roles_slug_active_unique'

const MODULES_TABLE = 'system_modules'
const MODULE_SLUG = 'system_module_slug'
const MODULE_SLUG_ACTIVE = 'system_module_slug_active'
const MODULE_DELETED_AT = 'system_module_deleted_at'
const MODULE_INDEX = 'system_modules_slug_active_unique'

const PERMISSIONS_TABLE = 'system_permissions'
const PERMISSION_SLUG = 'system_permission_slug'
const PERMISSION_SLUG_ACTIVE = 'system_permission_slug_active'
const PERMISSION_DELETED_AT = 'system_permission_deleted_at'
const PERMISSION_INDEX = 'system_permissions_module_slug_active_unique'

export default class extends BaseSchema {
  async up() {
    // Paso 0 — reparación de permisos duplicados, ANTES de cualquier DDL.
    // defer registrado primero → corre primero en trackedCalls.
    //
    // Es genérica a propósito: no nombra ids. En esta base el duplicado vivo es
    // el módulo 46 con dos `read` (187 y 188), pero cada entorno del equipo
    // arrastra los suyos según en qué orden corrieron los seeders. La regla es
    // siempre la misma: sobrevive el de menor id —el primero que se sembró, al
    // que apuntan las concesiones más antiguas—, las concesiones de los demás se
    // repuntan a él y los perdedores se dan de baja lógica. Nunca se borra.
    this.defer(async (db) => {
      type DuplicateRow = { system_module_id: number; slug: string; keeper_id: number }
      const [duplicates] = await db.rawQuery<[DuplicateRow[]]>(
        `SELECT
           \`system_module_id\`,
           \`${PERMISSION_SLUG}\` AS slug,
           MIN(\`system_permission_id\`) AS keeper_id
         FROM \`${PERMISSIONS_TABLE}\`
         WHERE \`${PERMISSION_DELETED_AT}\` IS NULL
         GROUP BY \`system_module_id\`, \`${PERMISSION_SLUG}\`
         HAVING COUNT(*) > 1`
      )

      for (const duplicate of duplicates) {
        // Las concesiones de los perdedores se copian al superviviente sin
        // duplicar las que ya existen.
        await db.rawQuery(
          `INSERT INTO \`role_system_permissions\`
             (\`role_id\`, \`system_permission_id\`,
              \`role_system_permission_created_at\`, \`role_system_permission_updated_at\`)
           SELECT DISTINCT \`rsp\`.\`role_id\`, ?, NOW(), NOW()
           FROM \`role_system_permissions\` AS \`rsp\`
           JOIN \`${PERMISSIONS_TABLE}\` AS \`p\`
             ON \`p\`.\`system_permission_id\` = \`rsp\`.\`system_permission_id\`
           WHERE \`p\`.\`system_module_id\` = ?
             AND \`p\`.\`${PERMISSION_SLUG}\` = ?
             AND \`p\`.\`system_permission_id\` <> ?
             AND \`p\`.\`${PERMISSION_DELETED_AT}\` IS NULL
             AND \`rsp\`.\`role_system_permission_deleted_at\` IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM \`role_system_permissions\` AS \`existente\`
               WHERE \`existente\`.\`role_id\` = \`rsp\`.\`role_id\`
                 AND \`existente\`.\`system_permission_id\` = ?
                 AND \`existente\`.\`role_system_permission_deleted_at\` IS NULL
             )`,
          [duplicate.keeper_id, duplicate.system_module_id, duplicate.slug, duplicate.keeper_id, duplicate.keeper_id]
        )

        // Baja lógica de los perdedores. Nunca DELETE: la fila queda para
        // auditoría y la columna generada la deja fuera del UNIQUE.
        await db.rawQuery(
          `UPDATE \`${PERMISSIONS_TABLE}\`
           SET \`${PERMISSION_DELETED_AT}\` = NOW()
           WHERE \`system_module_id\` = ?
             AND \`${PERMISSION_SLUG}\` = ?
             AND \`system_permission_id\` <> ?
             AND \`${PERMISSION_DELETED_AT}\` IS NULL`,
          [duplicate.system_module_id, duplicate.slug, duplicate.keeper_id]
        )
      }
    })

    // Paso 1 — detección de lo que la reparación no pudo resolver.
    // Roles y módulos no se reparan solos: un slug duplicado ahí es una
    // decisión de negocio, no un accidente de ids.
    this.defer(async (db) => {
      type RoleDupRow = { slug: string; total: number; roles: string }
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

      type ModuleDupRow = { slug: string; total: number; modulos: string }
      const [moduleDups] = await db.rawQuery<[ModuleDupRow[]]>(
        `SELECT
           \`${MODULE_SLUG}\` AS slug,
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT(\`system_module_id\`, ' (', \`system_module_name\`, ')')
             ORDER BY \`system_module_id\`
             SEPARATOR ', '
           ) AS modulos
         FROM \`${MODULES_TABLE}\`
         WHERE \`${MODULE_DELETED_AT}\` IS NULL
         GROUP BY \`${MODULE_SLUG}\`
         HAVING COUNT(*) > 1
         ORDER BY \`${MODULE_SLUG}\` ASC`
      )

      type PermissionDupRow = {
        system_module_id: number
        slug: string
        total: number
        permisos: string
      }
      const [permissionDups] = await db.rawQuery<[PermissionDupRow[]]>(
        `SELECT
           \`system_module_id\`,
           \`${PERMISSION_SLUG}\` AS slug,
           COUNT(*) AS total,
           GROUP_CONCAT(\`system_permission_id\` ORDER BY \`system_permission_id\` SEPARATOR ', ')
             AS permisos
         FROM \`${PERMISSIONS_TABLE}\`
         WHERE \`${PERMISSION_DELETED_AT}\` IS NULL
         GROUP BY \`system_module_id\`, \`${PERMISSION_SLUG}\`
         HAVING COUNT(*) > 1
         ORDER BY \`system_module_id\` ASC, \`${PERMISSION_SLUG}\` ASC`
      )

      if (roleDups.length === 0 && moduleDups.length === 0 && permissionDups.length === 0) return

      const lines: string[] = []
      if (roleDups.length > 0) {
        lines.push('Roles vivos compartiendo slug:')
        lines.push(...roleDups.map((r) => `  - "${r.slug}" x${r.total} -> ids ${r.roles}`))
      }
      if (moduleDups.length > 0) {
        lines.push('Módulos vivos compartiendo slug:')
        lines.push(
          ...moduleDups.map((r) => `  - "${r.slug}" x${r.total} -> ids ${r.modulos}`)
        )
      }
      if (permissionDups.length > 0) {
        lines.push('Permisos vivos compartiendo (módulo, slug):')
        lines.push(
          ...permissionDups.map(
            (r) => `  - módulo ${r.system_module_id} / "${r.slug}" x${r.total} -> ids ${r.permisos}`
          )
        )
      }

      throw new Error(
        '[USRH1789145449678] Catálogo con identidad duplicada — resolver antes de poner el candado:\n' +
          `${lines.join('\n')}`
      )
    })

    // Paso 2 — columnas generadas VIRTUAL: slug real en vivas, NULL en retiradas.
    this.schema.raw(`
      ALTER TABLE \`${ROLES_TABLE}\`
      ADD COLUMN \`${ROLE_SLUG_ACTIVE}\` VARCHAR(100)
        GENERATED ALWAYS AS (
          CASE WHEN \`${ROLE_DELETED_AT}\` IS NULL
               THEN \`${ROLE_SLUG}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`${MODULES_TABLE}\`
      ADD COLUMN \`${MODULE_SLUG_ACTIVE}\` VARCHAR(45)
        GENERATED ALWAYS AS (
          CASE WHEN \`${MODULE_DELETED_AT}\` IS NULL
               THEN \`${MODULE_SLUG}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`${PERMISSIONS_TABLE}\`
      ADD COLUMN \`${PERMISSION_SLUG_ACTIVE}\` VARCHAR(150)
        GENERATED ALWAYS AS (
          CASE WHEN \`${PERMISSION_DELETED_AT}\` IS NULL
               THEN \`${PERMISSION_SLUG}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    // Paso 3 — índices UNIQUE sobre las columnas generadas.
    // El de permisos es compuesto: un mismo slug de acción ("read") es válido
    // en módulos distintos, lo que no puede repetirse es dentro del mismo
    // módulo. En un UNIQUE compuesto basta que una columna sea NULL para que
    // la fila quede fuera de la restricción, así que las retiradas no compiten.
    this.schema.raw(`
      ALTER TABLE \`${ROLES_TABLE}\`
      ADD UNIQUE KEY \`${ROLE_INDEX}\` (\`${ROLE_SLUG_ACTIVE}\`)
    `)

    this.schema.raw(`
      ALTER TABLE \`${MODULES_TABLE}\`
      ADD UNIQUE KEY \`${MODULE_INDEX}\` (\`${MODULE_SLUG_ACTIVE}\`)
    `)

    this.schema.raw(`
      ALTER TABLE \`${PERMISSIONS_TABLE}\`
      ADD UNIQUE KEY \`${PERMISSION_INDEX}\`
        (\`system_module_id\`, \`${PERMISSION_SLUG_ACTIVE}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: consulta information_schema antes de cada
    // DROP para que el rollback funcione aunque up() haya abortado a media.
    this.defer(async (db) => {
      type CountRow = { cnt: number }

      const indexExists = async (table: string, index: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND index_name = ?`,
          [table, index]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      const columnExists = async (table: string, column: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE()
             AND table_name = ?
             AND column_name = ?`,
          [table, column]
        )
        return (rows[0]?.cnt ?? 0) > 0
      }

      // El índice se retira antes que la columna que lo sostiene.
      if (await indexExists(PERMISSIONS_TABLE, PERMISSION_INDEX)) {
        await db.rawQuery(
          `ALTER TABLE \`${PERMISSIONS_TABLE}\` DROP INDEX \`${PERMISSION_INDEX}\``
        )
      }
      if (await columnExists(PERMISSIONS_TABLE, PERMISSION_SLUG_ACTIVE)) {
        await db.rawQuery(
          `ALTER TABLE \`${PERMISSIONS_TABLE}\` DROP COLUMN \`${PERMISSION_SLUG_ACTIVE}\``
        )
      }

      if (await indexExists(ROLES_TABLE, ROLE_INDEX)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP INDEX \`${ROLE_INDEX}\``)
      }
      if (await columnExists(ROLES_TABLE, ROLE_SLUG_ACTIVE)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP COLUMN \`${ROLE_SLUG_ACTIVE}\``)
      }

      if (await indexExists(MODULES_TABLE, MODULE_INDEX)) {
        await db.rawQuery(`ALTER TABLE \`${MODULES_TABLE}\` DROP INDEX \`${MODULE_INDEX}\``)
      }
      if (await columnExists(MODULES_TABLE, MODULE_SLUG_ACTIVE)) {
        await db.rawQuery(
          `ALTER TABLE \`${MODULES_TABLE}\` DROP COLUMN \`${MODULE_SLUG_ACTIVE}\``
        )
      }
    })
  }
}
