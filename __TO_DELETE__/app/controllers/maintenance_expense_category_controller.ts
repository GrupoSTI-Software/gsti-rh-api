import { HttpContext } from '@adonisjs/core/http'
import MaintenanceExpenseCategoryService from '#services/maintenance_expense_category_service'

export default class MaintenanceExpenseCategoryController {
  /**
   * @swagger
   * /api/maintenance-expense-categories:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Expense Categories
   *     summary: Get all Maintenance Expense Categories
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search for a category by name or description
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: List of maintenance expense categories retrieved successfully
   *       '400':
   *         description: Invalid parameters
   *       '500':
   *         description: Server error
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)

      const filters = { search, page, limit }
      const categoryService = new MaintenanceExpenseCategoryService()
      const categories = await categoryService.index(filters)

      response.status(200).send({
        type: 'success',
        title: 'Maintenance Expense Categories',
        message: 'The maintenance expense categories were retrieved successfully',
        data: { categories },
      })
    } catch (error) {
      response.status(500).send({
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error occurred on the server',
        error: error.message,
      })
    }
  }
}
