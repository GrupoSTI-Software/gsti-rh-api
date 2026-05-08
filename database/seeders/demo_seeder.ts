import { BaseSeeder } from '@adonisjs/lucid/seeders'
import DemoFactoryService from '#services/demo_factory_service'

/**
 * DemoSeeder
 *
 * Delega toda la lógica de generación de datos DEMO en DemoFactoryService,
 * que es la única fuente de verdad compartida con el endpoint HTTP.
 *
 * Uso:
 *   node ace db:seed --files="database/seeders/demo_seeder.ts"
 *
 * Requisitos previos: ejecutar los seeders base (roles, tipos de excepción,
 * catálogo de vacaciones, tipos de dirección, propiedades de expediente, etc.)
 */
export default class DemoSeeder extends BaseSeeder {
  async run() {
    const service = new DemoFactoryService()
    const result  = await service.run()

    // eslint-disable-next-line no-console
    console.log('[DemoSeeder] Resultado:', JSON.stringify(result, null, 2))
  }
}
