import { BaseSchema } from '@adonisjs/lucid/schema'

const TABLE = 'access_points'

/**
 * El secreto que el checador lleva en la direccion del servidor.
 *
 * Hasta ahora la serie era la unica credencial del canal, y va impresa en el
 * aparato: quien la conociera podia pedir los comandos en cola --con los
 * templates biometricos dentro-- fabricar checadas o acusar ordenes ajenas.
 * Cada equipo pasa a tener su propia direccion, y la serie sola deja de abrir.
 *
 * Cifrado en reposo como el resto de lo sensible del tramo, y NO hasheado a
 * proposito: el operador tiene que poder consultarlo para volver a teclearlo
 * cuando alguien resetee un aparato. Con un hash, cada papelito perdido
 * obligaria a rotar.
 *
 * Nullable porque un punto de acceso sin secreto es uno que todavia no migro, y
 * durante la convivencia se le sigue atendiendo: cortarle de golpe deja a un
 * cliente sin asistencia por un ajuste que nadie le aviso.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.text('access_point_channel_secret').nullable()
      table.dateTime('access_point_channel_secret_set_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn('access_point_channel_secret')
      table.dropColumn('access_point_channel_secret_set_at')
    })
  }
}
