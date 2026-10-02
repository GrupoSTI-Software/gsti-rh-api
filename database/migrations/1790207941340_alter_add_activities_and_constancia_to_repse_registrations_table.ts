import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega al registro REPSE:
 *
 * - `repse_registration_activities`: texto libre con las actividades
 *   registradas ante la STPS (p. ej. "Seguridad privada, limpieza y
 *   desarrollo de software"). Nullable: los registros existentes no la tienen.
 * - Constancia de registro REPSE (PDF): key privada en el almacenamiento,
 *   nombre original del archivo y fecha de carga. Las tres son nullables y se
 *   escriben juntas; reemplazar la constancia sobrescribe las tres.
 *
 * La "próxima informativa" NO se persiste: es derivada por ley
 * (17 ene/may/sep) en `app/constants/repse_folio_aviso.ts`.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_registrations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('repse_registration_activities').nullable().after('repse_registration_status')
      table
        .string('repse_registration_constancia_storage_key', 500)
        .nullable()
        .after('repse_registration_activities')
      table
        .string('repse_registration_constancia_file_name', 255)
        .nullable()
        .after('repse_registration_constancia_storage_key')
      table
        .timestamp('repse_registration_constancia_uploaded_at')
        .nullable()
        .after('repse_registration_constancia_file_name')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('repse_registration_constancia_uploaded_at')
      table.dropColumn('repse_registration_constancia_file_name')
      table.dropColumn('repse_registration_constancia_storage_key')
      table.dropColumn('repse_registration_activities')
    })
  }
}
