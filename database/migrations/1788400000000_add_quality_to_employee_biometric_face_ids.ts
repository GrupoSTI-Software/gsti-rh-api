import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega la calidad de la foto biometrica facial.
 *
 * `employee_biometric_face_id_quality` guarda la confianza de deteccion
 * facial (0-100) que el Backoffice calcula con face-api al momento de
 * capturar o subir la imagen. Es metadato de la captura, no biometria: no
 * permite reidentificar a la persona, por eso no entra al enmascarado
 * sensible del `photo_url` — la lectura ya esta acotada por el permiso de
 * categoria biometrica del endpoint.
 *
 * Nullable a proposito: las fotos cargadas antes de esta columna no tienen
 * medicion y el detalle debe poder decir "sin registro" en vez de inventar
 * un numero.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_biometric_face_ids'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .tinyint('employee_biometric_face_id_quality')
        .unsigned()
        .nullable()
        .after('employee_biometric_face_id_token')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_biometric_face_id_quality')
    })
  }
}
