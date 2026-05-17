import CertificationCategory from '#models/certification_category'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/** Semilla idempotente: categorías iniciales del catálogo de certificaciones. */
export default class extends BaseSeeder {
  async run() {
    const rows = [
      { key: 'seguridad', name: 'Seguridad', order: 1 },
      { key: 'operacion', name: 'Operación', order: 2 },
      { key: 'tecnico', name: 'Técnico', order: 3 },
      { key: 'administrativo', name: 'Administrativo', order: 4 },
    ]

    for (const row of rows) {
      await CertificationCategory.updateOrCreate(
        { certificationCategoryKey: row.key },
        {
          certificationCategoryName: row.name,
          certificationCategoryDisplayOrder: row.order,
          certificationCategoryIsActive: 1,
        }
      )
    }
  }
}
