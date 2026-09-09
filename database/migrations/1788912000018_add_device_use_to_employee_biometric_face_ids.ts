import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Uso de la foto del colaborador en los checadores (spec ADMS 7.2).
 *
 * La foto que ya existe es para la app y el expediente. Mandarla a un aparato
 * es otra cosa y necesita su propio interruptor, con nombre y fecha de quien lo
 * encendio: es un tratamiento distinto del mismo dato.
 *
 * El derivado es una imagen NUEVA -- recortada y normalizada al tamaño que el
 * equipo acepta -- guardada en el bucket privado. El original no se toca ni
 * cambia de permisos.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_biometric_face_ids'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('employee_biometric_face_id_device_use')
        .notNullable()
        .defaultTo(false)
        .after('employee_biometric_face_id_quality')
      table
        .integer('employee_biometric_face_id_device_use_by_user_id')
        .unsigned()
        .nullable()
        .after('employee_biometric_face_id_device_use')
      table
        .dateTime('employee_biometric_face_id_device_use_at')
        .nullable()
        .after('employee_biometric_face_id_device_use_by_user_id')
      /** Llave del derivado en el bucket privado. Cifrada: senala a PII. */
      table
        .text('employee_biometric_face_id_derivative_key')
        .nullable()
        .after('employee_biometric_face_id_device_use_at')
      /** Sube con cada regeneracion: distingue que version se publico. */
      table
        .integer('employee_biometric_face_id_derivative_version')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('employee_biometric_face_id_derivative_key')
      /** Veredicto de la evaluacion de calidad, para explicar un rechazo. */
      table
        .string('employee_biometric_face_id_derivative_verdict', 40)
        .nullable()
        .after('employee_biometric_face_id_derivative_version')

      table
        .foreign('employee_biometric_face_id_device_use_by_user_id', 'fk_face_id_device_use_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        'employee_biometric_face_id_device_use_by_user_id',
        'fk_face_id_device_use_user'
      )
      table.dropColumn('employee_biometric_face_id_derivative_verdict')
      table.dropColumn('employee_biometric_face_id_derivative_version')
      table.dropColumn('employee_biometric_face_id_derivative_key')
      table.dropColumn('employee_biometric_face_id_device_use_at')
      table.dropColumn('employee_biometric_face_id_device_use_by_user_id')
      table.dropColumn('employee_biometric_face_id_device_use')
    })
  }
}
