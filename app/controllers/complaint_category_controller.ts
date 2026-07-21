import type { HttpContext } from '@adonisjs/core/http'
import ComplaintApiService from '#services/complaint_api_service'
import ComplaintCategoryService from '#services/complaint_category_service'

/**
 * Catálogo de categorías del buzón de quejas (NOM-035 8.1.b).
 */
export default class ComplaintCategoryController {
  private readonly complaintApiService = new ComplaintApiService()

  /**
   * @swagger
   * /api/v1/complaint-categories:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Complaint Categories
   *     summary: Listar categorías activas del buzón de quejas
   *     description: |
   *       Devuelve el catálogo global de categorías del buzón de quejas (NOM-035 8.1.b)
   *       con la etiqueta ya traducida según el locale del request (`Accept-Language`).
   *       Solo incluye categorías activas, ordenadas por `complaint_category_order`.
   *       Requiere sesión autenticada; no aplica scope de empresa porque el catálogo
   *       es normativo y compartido entre todos los tenants.
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         description: Idioma de las etiquetas (`es` por defecto, `en` soportado)
   *         schema:
   *           type: string
   *           example: es
   *     responses:
   *       '200':
   *         description: Catálogo obtenido correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Categorías del buzón de quejas
   *                 message:
   *                   type: string
   *                   example: Categorías del buzón obtenidas correctamente
   *                 data:
   *                   type: object
   *                   properties:
   *                     complaintCategories:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/ComplaintCategoryCatalogItem'
   *       '401':
   *         description: Sesión no autenticada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Error inesperado del servidor
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async index({ auth, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const categoryService = new ComplaintCategoryService()
      const result = await categoryService.listActiveWithLabels(i18n)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('complaint_category_title'),
        message: i18n.formatMessage('complaint_category_list_success'),
        data: result,
      }
    } catch (error) {
      return this.complaintApiService.respondError(error, response, 500, i18n)
    }
  }
}
