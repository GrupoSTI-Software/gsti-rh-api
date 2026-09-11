import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

const MODULE_ID = 33
const SLUG_ANTERIOR = 'puntos-de-acceso'
const SLUG_NUEVO = 'biometric-devices'
const NOMBRE_NUEVO = 'Dispositivos biométricos'
const RUTA_NUEVA = '/biometric-devices'
const NOMBRE_ANTERIOR = 'Puntos de acceso'
const RUTA_ANTERIOR = '/access-points'

/**
 * El modulo pasa a llamarse Dispositivos biometricos.
 *
 * El seeder deja la fila al dia en cualquier entorno donde se corra, pero los
 * seeders no siempre se ejecutan en un despliegue y esta fila no puede quedarse
 * atras: el Backoffice resuelve los permisos de la pantalla por el slug que
 * saca de la ruta, asi que un slug viejo contra una ruta nueva deja al modulo
 * sin permisos para todo el que no sea root u owner.
 *
 * De paso corrige una desalineacion que ya existia: la fila decia
 * `puntos-de-acceso` mientras la ruta era `/access-points`, de modo que la
 * consulta de permisos nunca encontraba el modulo.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      await db.rawQuery(
        `UPDATE \`system_modules\`
         SET \`system_module_slug\` = ?,
             \`system_module_name\` = ?,
             \`system_module_path\` = ?
         WHERE \`system_module_id\` = ?`,
        [SLUG_NUEVO, NOMBRE_NUEVO, RUTA_NUEVA, MODULE_ID]
      )
    })
  }

  async down() {
    this.defer(async () => {
      await db.rawQuery(
        `UPDATE \`system_modules\`
         SET \`system_module_slug\` = ?,
             \`system_module_name\` = ?,
             \`system_module_path\` = ?
         WHERE \`system_module_id\` = ?`,
        [SLUG_ANTERIOR, NOMBRE_ANTERIOR, RUTA_ANTERIOR, MODULE_ID]
      )
    })
  }
}
