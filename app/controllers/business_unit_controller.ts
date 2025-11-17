import BusinessUnitService from '#services/business_unit_service'
import { HttpContext } from '@adonisjs/core/http'

export default class BusinessUnitController {
  /**
   * @swagger
   * /api/business-units:
   *   get:
   *     tags:
   *       - Business Units
   *     summary: Get all system business units
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Business units fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   */
  async index({ response, i18n }: HttpContext) {
    const res = await new BusinessUnitService(i18n).index()
    return response.status(res.status || 200).send(res)
  }
}
