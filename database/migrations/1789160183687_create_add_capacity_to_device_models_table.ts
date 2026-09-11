import { BaseSchema } from '@adonisjs/lucid/schema'

const TABLE = 'platform_device_models'

/**
 * Capacidad del modelo, la que dice su ficha tecnica.
 *
 * El canal ya guarda lo que el equipo declara de si mismo, pero lo declarado
 * no siempre es la capacidad: el SpeedFace V5L del parque anuncia 20 checadas
 * y 100 usuarios, que son topes por lote y no lo que cabe en el aparato. Una
 * barra de ocupacion calculada con eso dice que el equipo esta lleno cuando
 * tiene sitio de sobra.
 *
 * Nullable porque capturarla es opcional y la regla del spec sigue en pie: sin
 * dato NO se inventa un maximo por modelo. Lo que cambia es de donde puede
 * venir --GSTI tecleandola desde la ficha del fabricante-- y que la pantalla
 * diga siempre cual de las dos fuentes esta mostrando.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.integer('platform_device_model_max_user_count').unsigned().nullable()
      table.integer('platform_device_model_max_finger_count').unsigned().nullable()
      table.integer('platform_device_model_max_face_count').unsigned().nullable()
      table.integer('platform_device_model_max_att_log_count').unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn('platform_device_model_max_user_count')
      table.dropColumn('platform_device_model_max_finger_count')
      table.dropColumn('platform_device_model_max_face_count')
      table.dropColumn('platform_device_model_max_att_log_count')
    })
  }
}
