import { HttpContext } from '@adonisjs/core/http'
import AircraftOperator from '#models/aircraft_operator'
import AircraftOperatorService from '#services/aircraft_operator_service'
import { createAircraftOperatorValidator } from '#validators/aircraft_operator'
import { cuid } from '@adonisjs/core/helpers'
import UploadService from '#services/upload_service'
import { AircraftOperatorFilterSearchInterface } from '../interfaces/aircraft_operator_filter_search_interface.js'
import path from 'node:path'
import Env from '#start/env'
export default class AircraftOperatorsController {
  /**
   * @swagger
   * /api/aircraft-operators:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Operators
   *     summary: Get all aircraft operators
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search filter
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: Invalid parameters or missing data
   *       default:
   *         description: Unexpected error
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      // 1) Retrieve query params
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)

      // 2) Build your filters (if needed)
      const filters = {
        search,
        page,
        limit,
      } as AircraftOperatorFilterSearchInterface

      // 3) Call service
      const aircraftOperatorService = new AircraftOperatorService()
      const operators = await aircraftOperatorService.index(filters)

      // 4) Return response
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: { operators },
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

  /**
   * @swagger
   * /api/aircraft-operators:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Operators
   *     summary: Create a new aircraft operator
   *     requestBody:
   *       content:
   *        multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The pilot photo
   *                 required: false
   *               aircraftOperatorName:
   *                 type: string
   *                 description: Name of the aircraft operator
   *                 required: true
   *               aircraftOperatorFiscalName:
   *                 type: string
   *               aircraftOperatorSlug:
   *                 type: string
   *               aircraftOperatorActive:
   *                 type: boolean
   *     responses:
   *       '201':
   *         description: Resource created successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      // 1) Retrieve input data
      const data = request.only([
        'aircraftOperatorName',
        'aircraftOperatorFiscalName',
        'aircraftOperatorSlug',
        'aircraftOperatorActive',
      ])

      const aircraftOperatorService = new AircraftOperatorService()

      const aircraftOperator = {
        aircraftOperatorId: 0,
        aircraftOperatorName: data.aircraftOperatorName,
        aircraftOperatorFiscalName: data.aircraftOperatorFiscalName ?? '',
        aircraftOperatorSlug: data.aircraftOperatorSlug,
        aircraftOperatorActive: data.aircraftOperatorActive,
      } as AircraftOperator

      // 2) Example of generating a slug if not provided
      if (!data.aircraftOperatorSlug) {
        // Here we use `cuid`, but adapt as you like
        aircraftOperator.aircraftOperatorSlug = `${data.aircraftOperatorName || 'operator'}-${cuid()}`
      }

      // 3) Validate if you have a validator
      const dataValid = await request.validateUsing(createAircraftOperatorValidator)
      const valid = await aircraftOperatorService.verifyInfo(aircraftOperator)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...dataValid },
        }
      }
      const validationOptions = {
        types: ['image'],
        size: '',
      }
      const photo = request.file('photo', validationOptions)
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: t('missing_data_to_process'),
            message: t('please_upload_a_image_valid'),
            data: photo,
          }
        }
        const uploadService = new UploadService()
        const fileName = `${new Date().getTime()}_${photo.clientName}`
        const fileUrl = await uploadService.fileUpload(photo, 'pilots', fileName)
        aircraftOperator.aircraftOperatorImage = fileUrl
      }
      // 4) Use service to create operator
      const newOperator = await aircraftOperatorService.create(aircraftOperator)
      // 5) Return response
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { operator: newOperator },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0]?.message : error.message

      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/aircraft-operators/{aircraftOperatorId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Operators
   *     summary: Update aircraft operator
   *     parameters:
   *       - in: path
   *         name: aircraftOperatorId
   *         schema:
   *           type: number
   *         description: Aircraft operator ID
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The pilot photo
   *                 required: false
   *               aircraftOperatorName:
   *                 type: string
   *               aircraftOperatorFiscalName:
   *                 type: string
   *               aircraftOperatorSlug:
   *                 type: string
   *               aircraftOperatorActive:
   *                 type: boolean
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      // 1) Retrieve route param
      const aircraftOperatorId = request.param('aircraftOperatorId')
      const aircraftOperatorService = new AircraftOperatorService()

      if (!aircraftOperatorId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { aircraftOperatorId },
        }
      }

      // 2) Retrieve the operator in DB
      const currentOperator = await AircraftOperator.query()
        .whereNull('aircraft_operator_deleted_at') // If you handle soft deletes
        .where('aircraft_operator_id', aircraftOperatorId)
        .first()

      if (!currentOperator) {
        response.status(404)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_was_not_found_with_the_entered_id'),
          data: { ...request.all() },
        }
      }
      // 3) Get request data
      const data = request.only([
        'aircraftOperatorName',
        'aircraftOperatorFiscalName',
        'aircraftOperatorSlug',
        'aircraftOperatorActive',
      ])

      const aircraftOperator = {
        aircraftOperatorName: data.aircraftOperatorName,
        aircraftOperatorFiscalName: data.aircraftOperatorFiscalName ?? '',
        aircraftOperatorSlug: data.aircraftOperatorSlug,
        aircraftOperatorActive: data.aircraftOperatorActive,
      } as AircraftOperator

      const valid = await aircraftOperatorService.verifyInfoExist(currentOperator)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }

      const validationOptions = {
        types: ['image'],
        size: '',
      }

      const photo = request.file('photo', validationOptions)
      aircraftOperator.aircraftOperatorImage = currentOperator.aircraftOperatorImage
      if (photo) {
        const allowedExtensions = ['jpeg', 'jpg', 'png', 'webp']
        if (!allowedExtensions.includes(photo.extname ? photo.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: t('missing_data_to_process'),
            message: t('please_upload_a_image_valid'),
            data: photo,
          }
        }
        const uploadService = new UploadService()
        if (currentOperator.aircraftOperatorImage) {
          const fileNameWithExt = path.basename(currentOperator.aircraftOperatorImage)
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/pilots/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        const fileName = `${new Date().getTime()}_${photo.clientName}`
        const fileUrl = await uploadService.fileUpload(photo, 'pilots', fileName)
        aircraftOperator.aircraftOperatorImage = fileUrl
      }

      // Example: you might want to check uniqueness, etc.
      // const valid = await aircraftOperatorService.verifyInfo(aircraftOperatorId, data)
      // if (valid.status !== 200) {
      //   response.status(valid.status)
      //   return { ...valid }
      // }

      // 5) Perform update
      const updatedOperator = await aircraftOperatorService.update(
        currentOperator,
        aircraftOperator
      )

      // 6) Return response
      response.status(200)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_updated_successfully'),
        data: { operator: updatedOperator },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0]?.message : error.message

      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/aircraft-operators/{aircraftOperatorId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Operators
   *     summary: Delete aircraft operator
   *     parameters:
   *       - in: path
   *         name: aircraftOperatorId
   *         schema:
   *           type: number
   *         description: Aircraft operator ID
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftOperatorId = request.param('aircraftOperatorId')

      if (!aircraftOperatorId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { aircraftOperatorId },
        }
      }

      const currentOperator = await AircraftOperator.query()
        .whereNull('aircraft_operator_deleted_at') // If you handle soft deletes
        .where('aircraft_operator_id', aircraftOperatorId)
        .first()

      if (!currentOperator) {
        response.status(404)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_was_not_found_with_the_entered_id'),
          data: { aircraftOperatorId },
        }
      }

      const aircraftOperatorService = new AircraftOperatorService()
      const deleteOperator = await aircraftOperatorService.delete(currentOperator)

      if (deleteOperator) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { operator: deleteOperator },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0]?.message : error.message

      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/aircraft-operators/{aircraftOperatorId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Operators
   *     summary: Get an aircraft operator by ID
   *     parameters:
   *       - in: path
   *         name: aircraftOperatorId
   *         schema:
   *           type: number
   *         description: Aircraft operator ID
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '400':
   *         description: Invalid parameters or missing data
   *       '404':
   *         description: Resource not found
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftOperatorId = request.param('aircraftOperatorId')
      if (!aircraftOperatorId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { aircraftOperatorId },
        }
      }

      const aircraftOperatorService = new AircraftOperatorService()
      const showOperator = await aircraftOperatorService.show(aircraftOperatorId)

      if (!showOperator) {
        response.status(404)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_was_not_found_with_the_entered_id'),
          data: { aircraftOperatorId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { operator: showOperator },
        }
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
