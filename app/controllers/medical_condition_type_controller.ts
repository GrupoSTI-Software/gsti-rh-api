import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import MedicalConditionTypeService from '#services/medical_condition_type_service'
import MedicalConditionType from '#models/medical_condition_type'
import {
  createMedicalConditionTypeValidator,
  updateMedicalConditionTypeValidator,
} from '#validators/medical_condition_type'

export default class MedicalConditionTypeController {
  /**
   * @swagger
   * /api/medical-condition-types:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Types
   *     summary: get all medical condition types
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
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *       default:
   *         description: Unexpected error
   */
  async index({ response }: HttpContext) {
    try {
      const medicalConditionTypes = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .preload('properties')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: medicalConditionTypes,
      })
    } catch (error) {
      return response.status(500).json({
        type: 'error',
        title: 'Server error',
        message: error.message,
        data: null,
      })
    }
  }

  /**
   * @swagger
   * /api/medical-condition-types:
   *   post:
   *     summary: Create a medical condition type
   *     tags:
   *       - Medical Condition Types
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypeName:
   *                 type: string
   *                 description: Medical condition type name
   *                 required: true
   *               medicalConditionTypeDescription:
   *                 type: string
   *                 description: Medical condition type description
   *                 required: false
   *               medicalConditionTypeActive:
   *                 type: number
   *                 description: Medical condition type status
   *                 required: false
   *                 default: 1
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  @inject()
  async store({ request, response }: HttpContext) {
    try {
      const medicalConditionTypeService = new MedicalConditionTypeService()
      let inputs = request.all()
      inputs = medicalConditionTypeService.sanitizeInput(inputs)
      await request.validateUsing(createMedicalConditionTypeValidator)

      const medicalConditionType = {
        medicalConditionTypeName: inputs['medicalConditionTypeName'],
        medicalConditionTypeDescription: inputs['medicalConditionTypeDescription'],
        medicalConditionTypeActive: inputs['medicalConditionTypeActive'] || 1,
      } as MedicalConditionType

      const isValidInfo = await medicalConditionTypeService.verifyInfo(medicalConditionType)
      if (isValidInfo.status !== 200) {
        response.status(isValidInfo.status)
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }

      const newMedicalConditionType = await medicalConditionTypeService.create(medicalConditionType)
      response.status(201)
      return {
        type: 'success',
        title: 'Medical condition type',
        message: 'The medical condition type was created successfully',
        data: { medicalConditionType: newMedicalConditionType },
      }
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          errors: error.messages,
        }
      }
      const messageError = error.message
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
   * /api/medical-condition-types/{medicalConditionTypeId}:
   *   put:
   *     summary: Update a medical condition type
   *     tags:
   *       - Medical Condition Types
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypeId
   *         schema:
   *           type: number
   *         description: Medical condition type id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypeName:
   *                 type: string
   *                 description: Medical condition type name
   *                 required: false
   *               medicalConditionTypeDescription:
   *                 type: string
   *                 description: Medical condition type description
   *                 required: false
   *               medicalConditionTypeActive:
   *                 type: number
   *                 description: Medical condition type status
   *                 required: false
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  @inject()
  async update({ request, response }: HttpContext) {
    try {
      const medicalConditionTypeService = new MedicalConditionTypeService()
      let inputs = request.all()
      inputs = medicalConditionTypeService.sanitizeInput(inputs)
      await request.validateUsing(updateMedicalConditionTypeValidator)

      const medicalConditionTypeId = request.param('medicalConditionTypeId')
      if (!medicalConditionTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypeId },
        }
      }

      const currentMedicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', medicalConditionTypeId)
        .first()

      if (!currentMedicalConditionType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type was not found',
          message: 'The medical condition type was not found with the entered ID',
          data: { medicalConditionTypeId },
        }
      }

      const medicalConditionType = {
        medicalConditionTypeId: medicalConditionTypeId,
        medicalConditionTypeName: inputs['medicalConditionTypeName'] || currentMedicalConditionType.medicalConditionTypeName,
        medicalConditionTypeDescription: inputs['medicalConditionTypeDescription'] || currentMedicalConditionType.medicalConditionTypeDescription,
        medicalConditionTypeActive: inputs['medicalConditionTypeActive'] !== undefined ? inputs['medicalConditionTypeActive'] : currentMedicalConditionType.medicalConditionTypeActive,
      } as MedicalConditionType

      const isValidInfo = await medicalConditionTypeService.verifyInfo(medicalConditionType)
      if (isValidInfo.status !== 200) {
        response.status(isValidInfo.status)
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }

      const updateMedicalConditionType = await medicalConditionTypeService.update(
        currentMedicalConditionType,
        medicalConditionType
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Medical condition type',
        message: 'The medical condition type was updated successfully',
        data: { medicalConditionType: updateMedicalConditionType },
      }
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          errors: error.messages,
        }
      }
      const messageError = error.message
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
   * /api/medical-condition-types/{medicalConditionTypeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Types
   *     summary: delete medical condition type
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypeId
   *         schema:
   *           type: number
   *         description: Medical condition type id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response }: HttpContext) {
    try {
      const medicalConditionTypeId = request.param('medicalConditionTypeId')
      if (!medicalConditionTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypeId },
        }
      }

      const currentMedicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', medicalConditionTypeId)
        .first()

      if (!currentMedicalConditionType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type was not found',
          message: 'The medical condition type was not found with the entered ID',
          data: { medicalConditionTypeId },
        }
      }

      const medicalConditionTypeService = new MedicalConditionTypeService()
      const deleteMedicalConditionType = await medicalConditionTypeService.delete(currentMedicalConditionType)
      if (deleteMedicalConditionType) {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type',
          message: 'The medical condition type was deleted successfully',
          data: { medicalConditionType: deleteMedicalConditionType },
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
   * /api/medical-condition-types/{medicalConditionTypeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Types
   *     summary: get medical condition type by id
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypeId
   *         schema:
   *           type: number
   *         description: Medical condition type id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response }: HttpContext) {
    try {
      const medicalConditionTypeId = request.param('medicalConditionTypeId')
      if (!medicalConditionTypeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypeId },
        }
      }

      const medicalConditionTypeService = new MedicalConditionTypeService()
      const showMedicalConditionType = await medicalConditionTypeService.show(medicalConditionTypeId)
      if (!showMedicalConditionType) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type was not found',
          message: 'The medical condition type was not found with the entered ID',
          data: { medicalConditionTypeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type',
          message: 'The medical condition type was found successfully',
          data: { showMedicalConditionType: showMedicalConditionType },
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
