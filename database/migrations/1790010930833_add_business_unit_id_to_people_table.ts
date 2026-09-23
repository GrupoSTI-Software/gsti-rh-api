import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1789698261609 — marca de empresa dueña del expediente personal.
 *
 * `people` era de las pocas tablas del producto que no sabía de qué empresa
 * cliente es cada renglón. Desde aquí cada expediente registra su empresa; la
 * marca la pone el modelo al crear (`Person.assignBusinessUnitId`) desde la
 * empresa activa de la petición, nunca desde el cuerpo.
 *
 * LA COLUMNA NUNCA DEBE VOLVERSE NOT NULL. `NULL` no es dato faltante: es un
 * valor con significado, "persona de plataforma" (regla 4). Nacen así, y deben
 * seguir naciendo así, el root de GrupoSTI (`0007_person_seeder`) y los usuarios
 * landlord (`platform_user_controller.store`). Un NOT NULL posterior rompería
 * el seeder raíz, el alta de landlord y el sync biométrico (residual D3 de la
 * HU). Es la diferencia con el molde que se calca (`…supply_value_histories`):
 * allá la columna terminará siendo obligatoria; aquí, no.
 *
 * FK sin `onDelete` => RESTRICT de MySQL, y es una decisión, no un olvido:
 * CASCADE borraría expedientes de PII al dar de baja una empresa; SET NULL los
 * volvería "de plataforma" e invisibles para todos (fail-closed), la peor forma
 * de perder un dato. RESTRICT obliga a resolverlos con un acto explícito antes
 * de borrar la empresa.
 *
 * Sin backfill: la base de producción arranca limpia el 2026-09-28. El índice
 * no es decorativo: desde esta HU toda lectura de `people` con contexto de
 * tenant —incluidos los `preload('person')`— lleva `WHERE business_unit_id IN`.
 */
export default class extends BaseSchema {
  protected tableName = 'people'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('person_id')
      table.index(['business_unit_id'], 'people_business_unit_id_index')
      table
        .foreign('business_unit_id', 'people_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'people_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'people_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
