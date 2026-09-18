import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Impide, desde la base, que una membresía traiga el rol de otra empresa.
 *
 * `business_unit_users.role_id` dice qué rol tiene una cuenta DENTRO de una
 * empresa. La FK simple que lo acompañaba solo comprobaba que el rol existiera,
 * no que fuera de esa empresa: nada en la base impedía escribir en la membresía
 * de la empresa A el `admin` de la empresa B, y ese es exactamente el cruce que
 * todo el rediseño busca cerrar. El runtime ya lo respeta; la base no tenía por
 * qué depender de que el runtime no se equivoque.
 *
 * La pieza es una FK COMPUESTA `(business_unit_id, role_id)` contra
 * `roles (business_unit_id, role_id)`, que necesita un UNIQUE de respaldo sobre
 * ese par en `roles` —redundante con la PK, pero es lo que MySQL exige para
 * referenciarlo—. La FK simple sale: la compuesta ya garantiza existencia, y
 * dos llaves sobre la misma columna solo confunden al leer el esquema.
 *
 * `role_id` sigue siendo NULLABLE y eso es deliberado: en MySQL una FK compuesta
 * con una columna NULL no se verifica, que es justo lo que hace falta para la
 * cuenta de plataforma (`root`), la única que pertenece a empresas sin tener un
 * rol dentro de ninguna. NULL significa "cuenta de plataforma", no "pendiente".
 */

const PIVOT_TABLE = 'business_unit_users'
const ROLES_TABLE = 'roles'
const OLD_FK = 'business_unit_users_role_id_foreign'
const NEW_FK = 'business_unit_users_role_business_unit_foreign'
const ROLES_UNIQUE = 'roles_business_unit_id_role_id_unique'

type CountRow = { cnt: number }

export default class extends BaseSchema {
  async up() {
    // Pre-check antes de cualquier DDL: en MySQL cada ALTER hace commit
    // implícito, así que abortar después dejaría el esquema a medias.
    this.defer(async (db) => {
      const [rows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM \`${PIVOT_TABLE}\` m
         JOIN \`${ROLES_TABLE}\` r ON r.role_id = m.role_id
         WHERE m.role_id IS NOT NULL
           AND (r.business_unit_id IS NULL OR r.business_unit_id <> m.business_unit_id)`
      )

      const stray = rows[0]?.cnt ?? 0
      if (stray > 0) {
        throw new Error(
          `[USRH-roles-por-empresa] ${stray} membresía(s) traen un rol que no es de su empresa. ` +
            'Corregirlas antes de poner el candado: la FK compuesta las rechazaría.'
        )
      }
    })

    this.schema.raw(
      `ALTER TABLE \`${ROLES_TABLE}\` ADD UNIQUE KEY \`${ROLES_UNIQUE}\` (\`business_unit_id\`, \`role_id\`)`
    )

    this.schema.raw(`ALTER TABLE \`${PIVOT_TABLE}\` DROP FOREIGN KEY \`${OLD_FK}\``)

    this.schema.raw(`
      ALTER TABLE \`${PIVOT_TABLE}\`
      ADD CONSTRAINT \`${NEW_FK}\`
      FOREIGN KEY (\`business_unit_id\`, \`role_id\`)
      REFERENCES \`${ROLES_TABLE}\` (\`business_unit_id\`, \`role_id\`)
    `)
  }

  async down() {
    this.defer(async (db) => {
      const exists = async (query: string, name: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(query, [name])
        return (rows[0]?.cnt ?? 0) > 0
      }

      const constraintExists = (table: string, name: string) =>
        exists(
          `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
           WHERE table_schema = DATABASE() AND table_name = '${table}' AND constraint_name = ?`,
          name
        )

      const indexExists = (table: string, name: string) =>
        exists(
          `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE() AND table_name = '${table}' AND index_name = ?`,
          name
        )

      if (await constraintExists(PIVOT_TABLE, NEW_FK)) {
        await db.rawQuery(`ALTER TABLE \`${PIVOT_TABLE}\` DROP FOREIGN KEY \`${NEW_FK}\``)
      }

      if (!(await constraintExists(PIVOT_TABLE, OLD_FK))) {
        await db.rawQuery(`
          ALTER TABLE \`${PIVOT_TABLE}\`
          ADD CONSTRAINT \`${OLD_FK}\`
          FOREIGN KEY (\`role_id\`) REFERENCES \`${ROLES_TABLE}\` (\`role_id\`)
        `)
      }

      if (await indexExists(ROLES_TABLE, ROLES_UNIQUE)) {
        await db.rawQuery(`ALTER TABLE \`${ROLES_TABLE}\` DROP INDEX \`${ROLES_UNIQUE}\``)
      }
    })
  }
}
