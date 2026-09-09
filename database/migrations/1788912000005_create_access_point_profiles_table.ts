import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Perfil del equipo: lo que el checador declara de si mismo en `options` e
 * `INFO` (spec ADMS v2, 9.1 y 10). Una fila por punto de acceso. La rebanada 1
 * solo escribe `_dialect` y `_registry_code`; la rebanada 2 llena el resto.
 *
 * Toda columna que viene del aparato es NULL cuando no la declara: la ausencia
 * nunca es cero ni "sin capacidad".
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_profile_id').notNullable()

      table
        .integer('access_point_id')
        .unsigned()
        .notNullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('CASCADE')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('access_point_profile_platform', 50).nullable()
      table.string('access_point_profile_fw_version', 100).nullable()
      table.string('access_point_profile_push_version', 50).nullable()
      table.string('access_point_profile_oem_vendor', 100).nullable()
      table
        .enum('access_point_profile_dialect', ['ta', 'ca', 'unknown'])
        .notNullable()
        .defaultTo('unknown')
      table.tinyint('access_point_profile_layout_known').unsigned().notNullable().defaultTo(0)
      table.string('access_point_profile_registry_code', 20).nullable()

      table.string('access_point_profile_fp_version', 10).nullable()
      table.string('access_point_profile_face_version', 10).nullable()
      table.string('access_point_profile_fv_version', 10).nullable()
      table.string('access_point_profile_pv_version', 10).nullable()
      table.json('access_point_profile_versions_source').nullable()
      table.string('access_point_profile_multi_bio_data_support', 50).nullable()
      table.string('access_point_profile_multi_bio_photo_support', 50).nullable()
      table.string('access_point_profile_multi_bio_version', 100).nullable()
      table.string('access_point_profile_max_multi_bio_data_count', 100).nullable()
      table.string('access_point_profile_max_multi_bio_photo_count', 100).nullable()
      table.integer('access_point_profile_max_face_count').unsigned().nullable()
      table.integer('access_point_profile_max_user_photo_count').unsigned().nullable()
      table.integer('access_point_profile_user_count').unsigned().nullable()
      table.integer('access_point_profile_fp_count').unsigned().nullable()
      table.integer('access_point_profile_face_count').unsigned().nullable()
      table.integer('access_point_profile_transaction_count').unsigned().nullable()
      table.tinyint('access_point_profile_finger_fun_on').unsigned().nullable()
      table.tinyint('access_point_profile_face_fun_on').unsigned().nullable()
      table.tinyint('access_point_profile_photo_fun_on').unsigned().nullable()
      table.tinyint('access_point_profile_user_pic_url_fun_on').unsigned().nullable()
      table.tinyint('access_point_profile_sip_enable_unit').unsigned().nullable()
      table.tinyint('access_point_profile_visual_intercom_fun_on').unsigned().nullable()
      table.tinyint('access_point_profile_subcontracting_upgrade_fun_on').unsigned().nullable()
      table.string('access_point_profile_video_protocol', 10).nullable()
      table.text('access_point_profile_options_raw').nullable()
      table.timestamp('access_point_profile_options_read_at').nullable()
      table.timestamp('access_point_profile_info_read_at').nullable()

      table.integer('access_point_profile_clock_offset_seconds').nullable()
      table.json('access_point_profile_clock_samples').nullable()
      table.timestamp('access_point_profile_clock_measured_at').nullable()
      table.timestamp('access_point_profile_clock_synced_at').nullable()
      table
        .enum('access_point_profile_clock_sync_status', [
          'ok',
          'drift',
          'unverified',
          'failed',
          'manual',
        ])
        .nullable()
      table.string('access_point_profile_last_ip_seen', 45).nullable()
      table.timestamp('access_point_profile_last_ip_seen_at').nullable()

      table.timestamp('access_point_profile_created_at').notNullable().defaultTo(this.now())
      table.timestamp('access_point_profile_updated_at').nullable()

      table.unique(['access_point_id'], 'uq_access_point_profile_access_point')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
