import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Capacidades que `options` declara y que la salud por modalidad necesita
 * (spec 9.2): usuarios, huellas y tamano de lote de checadas. NULL cuando el
 * aparato no las declara.
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('access_point_profile_max_user_count')
        .unsigned()
        .nullable()
        .after('access_point_profile_max_user_photo_count')
      table
        .integer('access_point_profile_max_finger_count')
        .unsigned()
        .nullable()
        .after('access_point_profile_max_user_count')
      table
        .integer('access_point_profile_max_att_log_count')
        .unsigned()
        .nullable()
        .after('access_point_profile_max_finger_count')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('access_point_profile_max_att_log_count')
      table.dropColumn('access_point_profile_max_finger_count')
      table.dropColumn('access_point_profile_max_user_count')
    })
  }
}
