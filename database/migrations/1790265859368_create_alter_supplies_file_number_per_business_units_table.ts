import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Folio del activo alfanumérico y único por empresa, más número de serie.
 *
 * - `supply_file_number` pasa de INT a VARCHAR(50): los folios existentes se
 *   conservan como texto (MySQL convierte el entero a su representación
 *   decimal).
 * - Se retira el UNIQUE global: dos empresas pueden usar el mismo folio.
 * - Unicidad por empresa entre activos vivos con el patrón del repo (columna
 *   generada + UNIQUE compuesto, como `people_*_company_unique`): la columna
 *   vale el folio solo si el activo no está borrado; en borrados es NULL y
 *   MySQL trata cada NULL como distinto, así que dar de baja libera el folio.
 *   El service ya ignoraba borrados; el UNIQUE plano los seguía contando.
 * - `supply_serial_number` nuevo, opcional; la descripción queda aparte.
 *
 * No hace censo de duplicados: el UNIQUE global previo garantiza que no hay
 * dos activos con el mismo folio, ni siquiera en empresas distintas.
 */
export default class extends BaseSchema {
  protected tableName = 'supplies'

  async up() {
    this.schema.raw('ALTER TABLE `supplies` DROP INDEX `supplies_supply_file_number_unique`')
    this.schema.raw('ALTER TABLE `supplies` MODIFY `supply_file_number` VARCHAR(50) NOT NULL')
    this.schema.raw(
      'ALTER TABLE `supplies`\n' +
        '  ADD COLUMN `supply_file_number_active` VARCHAR(50)\n' +
        '    GENERATED ALWAYS AS (\n' +
        '      CASE WHEN `supply_deleted_at` IS NULL THEN `supply_file_number` ELSE NULL END\n' +
        '    ) VIRTUAL'
    )
    this.schema.raw(
      'ALTER TABLE `supplies`\n' +
        '  ADD UNIQUE KEY `supplies_file_number_business_unit_unique` (`business_unit_id`, `supply_file_number_active`)'
    )
    this.schema.alterTable(this.tableName, (table) => {
      table.string('supply_serial_number', 100).nullable().after('supply_name')
    })
  }

  /**
   * Regresa al INT con UNIQUE global. Falla si ya hay folios no numéricos o
   * repetidos entre empresas: eso es dato real que no se puede degradar.
   */
  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('supply_serial_number')
    })
    this.schema.raw(
      'ALTER TABLE `supplies` DROP INDEX `supplies_file_number_business_unit_unique`'
    )
    this.schema.raw('ALTER TABLE `supplies` DROP COLUMN `supply_file_number_active`')
    this.schema.raw('ALTER TABLE `supplies` MODIFY `supply_file_number` INT UNSIGNED NOT NULL')
    this.schema.raw(
      'ALTER TABLE `supplies` ADD UNIQUE KEY `supplies_supply_file_number_unique` (`supply_file_number`)'
    )
  }
}
