import ComplaintCategory from '#models/complaint_category'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

/**
 * Catálogo global de categorías del buzón de quejas (NOM-035 numeral 8.1.b).
 *
 * `firstOrCreate` por slug → idempotente en re-ejecuciones del seeder.
 * El texto visible se resuelve por i18n (`complaint_category_<slug>`).
 */
export default class extends BaseSeeder {
  async run() {
    const categorias = [
      { slug: 'violencia-laboral', order: 1 },
      { slug: 'entorno', order: 2 },
      { slug: 'otro', order: 3 },
    ]

    for (const categoria of categorias) {
      await ComplaintCategory.firstOrCreate(
        { complaintCategorySlug: categoria.slug },
        {
          complaintCategoryActive: 1,
          complaintCategoryOrder: categoria.order,
          complaintCategoryCreatedAt: DateTime.now(),
        }
      )
    }
  }
}
