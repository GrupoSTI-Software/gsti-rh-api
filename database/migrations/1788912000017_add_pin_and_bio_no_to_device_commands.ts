import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * PIN y numero de biometrico del comando, en columnas propias.
 *
 * El payload va cifrado, asi que sin esto la evidencia de ejecucion no puede
 * correlacionar: cuando el equipo sube una huella hay que saber que comando de
 * enrolamiento la pidio, y descifrar toda la cola para averiguarlo no es una
 * opcion. El PIN ya vive en claro en `access_point_employees`; esta columna no
 * expone nada que no estuviera expuesto y a cambio se puede indexar.
 */
export default class extends BaseSchema {
  protected tableName = 'device_commands'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('device_command_pin', 9).nullable().after('device_command_kind')
      table.tinyint('device_command_bio_no').unsigned().nullable().after('device_command_pin')
      table.index(
        ['access_point_id', 'device_command_pin', 'device_command_status'],
        'idx_device_command_pin_status'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['access_point_id', 'device_command_pin', 'device_command_status'],
        'idx_device_command_pin_status'
      )
      table.dropColumn('device_command_bio_no')
      table.dropColumn('device_command_pin')
    })
  }
}
