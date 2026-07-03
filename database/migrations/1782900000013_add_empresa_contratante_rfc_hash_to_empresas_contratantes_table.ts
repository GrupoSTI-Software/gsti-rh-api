import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega la huella del RFC de empresa y reemplaza el candado de unicidad.
 *
 * Orden deliberado (sin estado intermedio cifrado-sin-candado):
 *   1. ADD COLUMN rfc_hash — columna nula mientras no corra el backfill.
 *   2. DROP UNIQUE viejo (sobre el RFC en claro).
 *   3. ADD UNIQUE nuevo (sobre rfc_hash + business_unit_id + is_active).
 */
export default class extends BaseSchema {
  protected tableName = 'empresas_contratantes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('empresa_contratante_rfc_hash', 64).nullable().after('empresa_contratante_rfc')
    })

    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      DROP INDEX \`empresas_contratantes_business_unit_rfc_active_unique\`
    `)

    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      ADD UNIQUE KEY \`empresas_contratantes_business_unit_rfc_hash_active_unique\`
        (\`business_unit_id\`, \`empresa_contratante_rfc_hash\`, \`empresa_contratante_is_active\`)
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      DROP INDEX \`empresas_contratantes_business_unit_rfc_hash_active_unique\`
    `)

    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      ADD UNIQUE KEY \`empresas_contratantes_business_unit_rfc_active_unique\`
        (\`business_unit_id\`, \`empresa_contratante_rfc\`, \`empresa_contratante_is_active\`)
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('empresa_contratante_rfc_hash')
    })
  }
}
