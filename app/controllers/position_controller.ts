import Position from '#models/position'
import PositionService from '#services/position_service'
import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import axios from 'axios'
import BiometricPositionInterface from '../interfaces/biometric_position_interface.js'
import { createPositionValidator, updatePositionValidator } from '#validators/position'
import { PositionShiftFilterInterface } from '../interfaces/position_shift_filter_interface.js'

export default class PositionController {
  /**
   * @swagger
   * /api/synchronization/positions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: sync information
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               page:
   *                 type: integer
   *                 description: The page number for pagination
   *                 required: false
   *                 default: 1
   *               limit:
   *                 type: integer
   *                 description: The number of records per page
   *                 required: false
   *                 default: 200
   *               positionCode:
   *                 type: string
   *                 description: The position code to filter by
   *                 required: false
   *                 default: ''
   *               positionName:
   *                 required: false
   *                 description: The position name to filter by
   *                 type: string
   *                 default: ''
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */

  async synchronization({ request, response, i18n }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 200)
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')

      let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/positions`
      apiUrl = `${apiUrl}?page=${page || ''}`
      apiUrl = `${apiUrl}&limit=${limit || ''}`
      apiUrl = `${apiUrl}&positionCode=${positionCode || ''}`
      apiUrl = `${apiUrl}&positionName=${positionName || ''}`
      const apiResponse = await axios.get(apiUrl)
      const data = apiResponse.data.data
      if (data) {
        const positionService = new PositionService(i18n)
        data.sort((a: BiometricPositionInterface, b: BiometricPositionInterface) => a.id - b.id)
        for await (const position of data) {
          await this.verify(position, positionService)
        }
        response.status(200)
        return {
          type: 'success',
          title: 'Sync positions',
          message: 'Positions have been synchronized successfully',
          data: {
            data,
          },
        }
      } else {
        response.status(404)
        return {
          type: 'warning',
          title: 'Sync positions',
          message: 'No data found to synchronize',
          data: { data },
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

  /**
   * @swagger
   * /api/positions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: create new position
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionCode:
   *                 type: string
   *                 description: Position code
   *                 required: true
   *                 default: ''
   *               positionName:
   *                 type: string
   *                 description: Position name
   *                 required: true
   *                 default: ''
   *               positionAlias:
   *                 type: string
   *                 description: Position alias
   *                 required: false
   *                 default: ''
   *               positionIsDefault:
   *                 type: boolean
   *                 description: Position if is default
   *                 required: false
   *                 default: false
   *               positionActive:
   *                 type: boolean
   *                 description: Position status
   *                 required: false
   *                 default: false
   *               parentPositionId:
   *                 type: number
   *                 description: Position parent id
   *                 required: false
   *                 default: ''
   *               companyId:
   *                 type: number
   *                 description: Company id
   *                 required: true
   *                 default: ''
   *     responses:
   *       '201':
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ request, response, i18n }: HttpContext) {
    try {
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')
      const positionAlias = request.input('positionAlias')
      const positionIsDefault = request.input('positionIsDefault')
      const positionActive = request.input('positionActive')
      const parentPositionId = request.input('parentPositionId')

      const position = {
        positionCode: positionCode,
        positionName: positionName,
        positionAlias: positionAlias,
        positionIsDefault: positionIsDefault,
        positionActive: positionActive,
        parentPositionId: parentPositionId,
      } as Position

      const positionService = new PositionService(i18n)
      const data = await request.validateUsing(createPositionValidator)
      const exist = await positionService.verifyInfoExist(position)

      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const newPosition = await positionService.create(position)

      if (newPosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was created successfully',
          data: { position: newPosition },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: update position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionCode:
   *                 type: string
   *                 description: Position code
   *                 required: true
   *                 default: ''
   *               positionName:
   *                 type: string
   *                 description: Position name
   *                 required: true
   *                 default: ''
   *               positionAlias:
   *                 type: string
   *                 description: Position alias
   *                 required: false
   *                 default: ''
   *               positionIsDefault:
   *                 type: boolean
   *                 description: Position if is default
   *                 required: false
   *                 default: false
   *               positionActive:
   *                 type: boolean
   *                 description: Position status
   *                 required: false
   *                 default: false
   *               parentPositionId:
   *                 type: number
   *                 description: Position parent id
   *                 required: false
   *                 default: ''
   *               companyId:
   *                 type: number
   *                 description: Company id
   *                 required: true
   *                 default: ''
   *     responses:
   *       '201':
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async update({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')
      const positionAlias = request.input('positionAlias')
      const positionIsDefault = request.input('positionIsDefault')
      const positionActive = request.input('positionActive')
      const parentPositionId = request.input('parentPositionId')
      const companyId = request.input('companyId')
      const position = {
        positionId: positionId,
        positionCode: positionCode,
        positionName: positionName,
        positionAlias: positionAlias,
        positionIsDefault: positionIsDefault,
        positionActive: positionActive,
        parentPositionId: parentPositionId,
        companyId: companyId,
      } as Position
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { ...position },
        }
      }
      const currentPosition = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', positionId)
        .first()
      if (!currentPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { ...position },
        }
      }
      const positionService = new PositionService(i18n)
      const data = await request.validateUsing(updatePositionValidator)
      const exist = await positionService.verifyInfoExist(position)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await positionService.verifyInfo(position)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updatePosition = await positionService.update(currentPosition, position)
      if (updatePosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was updated successfully',
          data: { position: updatePosition },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: delete position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
   *         required: true
   *     responses:
   *       '201':
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  // async delete({ request, response }: HttpContext) {
  //   try {
  //     const positionId = request.param('positionId')
  //     if (!positionId) {
  //       response.status(400)
  //       return {
  //         type: 'warning',
  //         title: 'The position Id was not found',
  //         message: 'Missing data to process',
  //         data: { positionId },
  //       }
  //     }
  //     const currentPosition = await Position.query()
  //       .whereNull('position_deleted_at')
  //       .where('position_id', positionId)
  //       .first()
  //     if (!currentPosition) {
  //       response.status(404)
  //       return {
  //         type: 'warning',
  //         title: 'The position was not found',
  //         message: 'The position was not found with the entered ID',
  //         data: { positionId },
  //       }
  //     }
  //     const positionService = new PositionService()
  //     const deletePosition = await positionService.delete(currentPosition)
  //     if (deletePosition) {
  //       response.status(201)
  //       return {
  //         type: 'success',
  //         title: 'Positions',
  //         message: 'The position was deleted successfully',
  //         data: { position: deletePosition },
  //       }
  //     }
  //   } catch (error) {
  //     response.status(500)
  //     return {
  //       type: 'error',
  //       title: 'Server error',
  //       message: 'An unexpected error has occurred on the server',
  //       error: error.message,
  //     }
  //   }
  // }
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }
      // Buscar la posición actual
      const currentPosition = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', positionId)
        .first()
      if (!currentPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      }
      // Obtener empleados relacionados con la posición
      const employees = await currentPosition
        .related('employees')
        .query()
        .whereNull('employee_deleted_at')

      // Si hay empleados, asignarles la posición "Sin posición"
      if (employees.length > 0) {
        const defaultPosition = await Position.query()
          .whereNull('position_deleted_at')
          .where('position_name', 'Sin posición')
          .first()

        if (defaultPosition) {
          for (const employee of employees) {
            employee.positionId = defaultPosition.positionId
            await employee.save()
          }
        }
      }

      // Proceder con la eliminación
      const positionService = new PositionService(i18n)
      const deletePosition = await positionService.delete(currentPosition)
      if (deletePosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was deleted successfully',
          data: { position: deletePosition },
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
  /**
   * @swagger
   * /api/positions/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get position by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }

      const positionService = new PositionService(i18n)
      const showPosition = await positionService.show(positionId)

      if (!showPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was found successfully',
          data: { position: showPosition },
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

  /**
   * @swagger
   * /api/positions/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get positions
   *     produces:
   *       - application/json
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async get({ response, i18n }: HttpContext) {
    try {
      const positionService = new PositionService(i18n)
      const positions = await positionService.get()

      response.status(200)
      return {
        type: 'success',
        title: 'Positions',
        message: 'The position was found successfully',
        data: { positions },
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
   * /api/position/assign-shift/{positionId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: assign shift to employees by position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               departmentId:
   *                 type: number
   *                 description: Department id
   *                 required: true
   *                 default: ''
   *               shiftId:
   *                 type: number
   *                 description: Shift id
   *                 required: true
   *                 default: ''
   *               applySince:
   *                 type: string
   *                 format: date
   *                 description: Apply since (YYYY-MM-DD HH:mm:ss)
   *                 required: true
   *                 default: ''
   *     responses:
   *       '201':
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async assignShift({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      const departmentId = request.input('departmentId')
      const shiftId = request.input('shiftId')
      const applySince = request.input('applySince')
      const positionShiftFilterInterface = {
        departmentId: departmentId,
        positionId: positionId,
        shiftId: shiftId,
        applySince: applySince,
      } as PositionShiftFilterInterface

      const positionService = new PositionService(i18n)
      const isValidInfo = await positionService.verifyInfoAssignShift(positionShiftFilterInterface)
      if (isValidInfo.status !== 200) {
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }
      const assignPosition = await positionService.assignShift(positionShiftFilterInterface)
      if (assignPosition.status === 201) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The shift was assign to position successfully',
          data: { position: assignPosition },
        }
      } else {
        return {
          status: assignPosition.status,
          type: assignPosition.type,
          title: assignPosition.title,
          message: assignPosition.message,
          data: {},
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

  private async verify(position: BiometricPositionInterface, positionService: PositionService) {
    const existPosition = await Position.query().where('position_sync_id', position.id).first()
    if (!existPosition) {
      await positionService.syncCreate(position)
    }
  }
}
