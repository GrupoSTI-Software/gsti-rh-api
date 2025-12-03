import { HttpContext } from '@adonisjs/core/http'

export default class AddressTypeController {
  /**
   * @swagger
   * /api/get-coordinates/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Coordinates
   *     summary: get all
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getCoordinates({ response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    // const employeeId = request.param('employeeId')
    try {
      
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          'coordinates': [
          [
            [
              -103.10699332790298,
              25.45307646653235
            ],
            [
              -103.10699477965788,
              25.453039762898655
            ],
            [
              -103.1069388871013,
              25.453030586989115
            ],
            [
              -103.10692872481849,
              25.453069256890927
            ],
            [
              -103.10699332790298,
              25.45307646653235
            ]
          ],
          [
            [
              -103.1068901917337,
              25.453100079963235
            ],
            [
              -103.10689823747164,
              25.45306323705701
            ],
            [
              -103.10683846913405,
              25.453051820942818
            ],
            [
              -103.10683099809172,
              25.45308840439543
            ],
            [
              -103.1068901917337,
              25.453100079963235
            ]
          ]
        ],
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
