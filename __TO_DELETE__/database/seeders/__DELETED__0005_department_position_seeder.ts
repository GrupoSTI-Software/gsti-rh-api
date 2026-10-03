import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Retirado por USRH1789328927671: su única fila era la relación de relleno.
 * El archivo se conserva porque el cargador de seeders ejecuta todos los
 * archivos de la carpeta. No sembrar catálogo aquí.
 */
export default class DepartmentPositionSeeder extends BaseSeeder {
  async run(): Promise<void> {
    return Promise.resolve()
  }
}
