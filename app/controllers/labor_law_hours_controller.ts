import { HttpContext } from '@adonisjs/core/http'
import LaborLawHour from '#models/labor_law_hour'
import LaborLawHoursService from '#services/labor_law_hours_service'

export default class LaborLawHoursController {
  /**
   * @swagger
   * /api/labor-law-hours:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: get all labor law hours
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid
   */
  async index({ response }: HttpContext) {
    try {
      const laborLawHoursService = new LaborLawHoursService()
      const laborLawHours = await laborLawHoursService.index()
      response.status(200)
      return {
        type: 'success',
        title: 'Labor Law Hours',
        message: 'The labor law hours were found successfully',
        data: {
          laborLawHours,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/labor-law-hours/active:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: get active labor law hours
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   */
  async getActive({ response }: HttpContext) {
    try {
      const laborLawHoursService = new LaborLawHoursService()
      const laborLawHour = await laborLawHoursService.getActive()
      response.status(200)
      return {
        type: 'success',
        title: 'Labor Law Hours',
        message: 'The active labor law hours were found successfully',
        data: {
          laborLawHour,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/labor-law-hours:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: create new labor law hours
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               laborLawHoursHoursPerWeek:
   *                 type: number
   *               laborLawHoursActive:
   *                 type: number
   *               laborLawHoursApplySince:
   *                 type: string
   *               laborLawHoursDescription:
   *                 type: string
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   */
  async store({ request, response }: HttpContext) {
    try {
      const laborLawHour = {
        laborLawHoursHoursPerWeek: request.input('laborLawHoursHoursPerWeek'),
        laborLawHoursActive: request.input('laborLawHoursActive', 1),
        laborLawHoursApplySince: request.input('laborLawHoursApplySince'),
        laborLawHoursDescription: request.input('laborLawHoursDescription'),
      } as LaborLawHour

      const laborLawHoursService = new LaborLawHoursService()
      const newLaborLawHour = await laborLawHoursService.create(laborLawHour)
      response.status(201)
      return {
        type: 'success',
        title: 'Labor Law Hours',
        message: 'The labor law hours was created successfully',
        data: { laborLawHour: newLaborLawHour },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/labor-law-hours/{laborLawHoursId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: update labor law hours
   *     parameters:
   *       - in: path
   *         name: laborLawHoursId
   *         required: true
   *         schema:
   *           type: number
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               laborLawHoursHoursPerWeek:
   *                 type: number
   *               laborLawHoursActive:
   *                 type: number
   *               laborLawHoursApplySince:
   *                 type: string
   *               laborLawHoursDescription:
   *                 type: string
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   */
  async update({ request, response }: HttpContext) {
    try {
      const laborLawHoursId = request.param('laborLawHoursId')
      const currentLaborLawHour = await LaborLawHour.query()
        .whereNull('labor_law_hours_deleted_at')
        .where('labor_law_hours_id', laborLawHoursId)
        .first()

      if (!currentLaborLawHour) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Labor Law Hours not found',
          message: 'The labor law hours was not found with the entered ID',
          data: { laborLawHoursId },
        }
      }

      const laborLawHour = {
        laborLawHoursHoursPerWeek: request.input('laborLawHoursHoursPerWeek'),
        laborLawHoursActive: request.input('laborLawHoursActive', currentLaborLawHour.laborLawHoursActive),
        laborLawHoursApplySince: request.input('laborLawHoursApplySince'),
        laborLawHoursDescription: request.input('laborLawHoursDescription'),
      } as LaborLawHour

      const laborLawHoursService = new LaborLawHoursService()
      const updateLaborLawHour = await laborLawHoursService.update(currentLaborLawHour, laborLawHour)
      response.status(201)
      return {
        type: 'success',
        title: 'Labor Law Hours',
        message: 'The labor law hours was updated successfully',
        data: { laborLawHour: updateLaborLawHour },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/labor-law-hours/{laborLawHoursId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: delete labor law hours
   *     parameters:
   *       - in: path
   *         name: laborLawHoursId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   */
  async delete({ request, response }: HttpContext) {
    try {
      const laborLawHoursId = request.param('laborLawHoursId')
      const currentLaborLawHour = await LaborLawHour.query()
        .whereNull('labor_law_hours_deleted_at')
        .where('labor_law_hours_id', laborLawHoursId)
        .first()

      if (!currentLaborLawHour) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Labor Law Hours not found',
          message: 'The labor law hours was not found with the entered ID',
          data: { laborLawHoursId },
        }
      }

      const laborLawHoursService = new LaborLawHoursService()
      const deleteLaborLawHour = await laborLawHoursService.delete(currentLaborLawHour)
      response.status(201)
      return {
        type: 'success',
        title: 'Labor Law Hours',
        message: 'The labor law hours was deleted successfully',
        data: { laborLawHour: deleteLaborLawHour },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/labor-law-hours/{laborLawHoursId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Labor Law Hours
   *     summary: get labor law hours by id
   *     parameters:
   *       - in: path
   *         name: laborLawHoursId
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   */
  async show({ request, response }: HttpContext) {
    try {
      const laborLawHoursId = request.param('laborLawHoursId')
      const laborLawHoursService = new LaborLawHoursService()
      const laborLawHour = await laborLawHoursService.show(laborLawHoursId)
      if (!laborLawHour) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Labor Law Hours not found',
          message: 'The labor law hours was not found with the entered ID',
          data: { laborLawHoursId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Labor Law Hours',
          message: 'The labor law hours was found successfully',
          data: { laborLawHour },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}

