import CertificationCategory from '#models/certification_category'
import { POSITION_TEMPLATE_CERTIFICATION_CATEGORIES } from '#constants/position_template_format'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Semilla idempotente: categorías del catálogo de certificaciones. Salen de la misma
 * constante que acepta el formato de plantillas de puesto (VLRH-H1792026425571).
 */
export default class extends BaseSeeder {
  async run() {
    for (const row of POSITION_TEMPLATE_CERTIFICATION_CATEGORIES) {
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
