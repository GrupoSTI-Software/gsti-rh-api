import type { I18n } from '@adonisjs/i18n'
import ComplaintCategory from '#models/complaint_category'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import type {
  ComplaintCategoryCatalogItem,
  ComplaintCategoryListResult,
} from '../interfaces/complaint_category_interface.js'

/**
 * Catálogo global de categorías del buzón de quejas (NOM-035).
 * El texto visible se resuelve por i18n server-side; la BD solo guarda slug/active/order.
 */
export default class ComplaintCategoryService {
  /**
   * Lista categorías activas ordenadas para consumo de clientes autenticados.
   */
  async listActiveWithLabels(i18n: I18n): Promise<ComplaintCategoryListResult> {
    const rows = await ComplaintCategory.query()
      .where('complaintCategoryActive', 1)
      .whereNull('complaint_category_deleted_at')
      .orderBy('complaintCategoryOrder')
      .orderBy('complaintCategoryId')

    return {
      complaintCategories: rows.map((row) => this.serializeCatalogItem(row, i18n)),
    }
  }

  /**
   * Resuelve una categoría activa por slug o lanza 422 si no existe / está inactiva.
   */
  async findActiveBySlugOrFail(slug: string): Promise<ComplaintCategory> {
    const category = await ComplaintCategory.query()
      .where('complaintCategorySlug', slug)
      .where('complaintCategoryActive', 1)
      .whereNull('complaint_category_deleted_at')
      .first()

    if (!category) {
      this.throwCategoryNotFound()
    }

    return category!
  }

  /** Key i18n canónica del catálogo para un slug. */
  categoryLabelKey(slug: string): string {
    return `complaint_category_${slug.replace(/-/g, '_')}`
  }

  /** Etiqueta traducida con fallback al slug legible si falta la key. */
  resolveLabel(slug: string, i18n: I18n): string {
    const key = this.categoryLabelKey(slug)
    const translated = i18n.formatMessage(key)
    return translated === key ? slug : translated
  }

  serializeCatalogItem(category: ComplaintCategory, i18n: I18n): ComplaintCategoryCatalogItem {
    return {
      complaintCategoryId: category.complaintCategoryId,
      complaintCategorySlug: category.complaintCategorySlug,
      complaintCategoryLabel: this.resolveLabel(category.complaintCategorySlug, i18n),
    }
  }

  private throwCategoryNotFound(): never {
    throw ComplaintServiceError.withMessageKey(
      'complaint_category_not_found',
      COMPLAINT_ERROR_CODES.CATEGORY_NOT_FOUND,
      422,
      'CMPL.VAL.CATEGORY'
    )
  }
}
