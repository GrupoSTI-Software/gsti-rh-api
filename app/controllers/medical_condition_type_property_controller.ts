import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import MedicalConditionTypePropertyService from '#services/medical_condition_type_property_service'
import MedicalConditionTypeProperty from '#models/medical_condition_type_property'
import {
  createMedicalConditionTypePropertyValidator,
  updateMedicalConditionTypePropertyValidator,
} from '#validators/medical_condition_type_property'

export default class MedicalConditionTypePropertyController {
  /**
   * @swagger
   * /api/medical-condition-type-properties:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Properties
   *     summary: get all medical condition type properties
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
      const medicalConditionTypeProperties = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .preload('medicalConditionType')
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: medicalConditionTypeProperties,
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
   * /api/medical-condition-type-properties:
   *   post:
   *     summary: Create a medical condition type property
   *     tags:
   *       - Medical Condition Type Properties
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypePropertyName:
   *                 type: string
   *                 description: Medical condition type property name
   *                 required: true
   *               medicalConditionTypePropertyDescription:
   *                 type: string
   *                 description: Medical condition type property description
   *                 required: false
   *               medicalConditionTypePropertyDataType:
   *                 type: string
   *                 description: Medical condition type property data type
   *                 required: true
   *               medicalConditionTypePropertyRequired:
   *                 type: number
   *                 description: Medical condition type property required flag
   *                 required: false
   *                 default: 0
   *               medicalConditionTypeId:
   *                 type: number
   *                 description: Medical condition type ID
   *                 required: true
   *               medicalConditionTypePropertyActive:
   *                 type: number
   *                 description: Medical condition type property status
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
      const medicalConditionTypePropertyService = new MedicalConditionTypePropertyService()
      let inputs = request.all()
      inputs = medicalConditionTypePropertyService.sanitizeInput(inputs)
      await request.validateUsing(createMedicalConditionTypePropertyValidator)

      const medicalConditionTypeProperty = {
        medicalConditionTypePropertyName: inputs['medicalConditionTypePropertyName'],
        medicalConditionTypePropertyDescription: inputs['medicalConditionTypePropertyDescription'],
        medicalConditionTypePropertyDataType: inputs['medicalConditionTypePropertyDataType'],
        medicalConditionTypePropertyRequired: inputs['medicalConditionTypePropertyRequired'] || 0,
        medicalConditionTypeId: inputs['medicalConditionTypeId'],
        medicalConditionTypePropertyActive: inputs['medicalConditionTypePropertyActive'] || 1,
      } as MedicalConditionTypeProperty

      const isValidInfo = await medicalConditionTypePropertyService.verifyInfo(medicalConditionTypeProperty)
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

      const newMedicalConditionTypeProperty = await medicalConditionTypePropertyService.create(medicalConditionTypeProperty)
      response.status(201)
      return {
        type: 'success',
        title: 'Medical condition type property',
        message: 'The medical condition type property was created successfully',
        data: { medicalConditionTypeProperty: newMedicalConditionTypeProperty },
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
   * /api/medical-condition-type-properties/{medicalConditionTypePropertyId}:
   *   put:
   *     summary: Update a medical condition type property
   *     tags:
   *       - Medical Condition Type Properties
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyId
   *         schema:
   *           type: number
   *         description: Medical condition type property id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypePropertyName:
   *                 type: string
   *                 description: Medical condition type property name
   *                 required: false
   *               medicalConditionTypePropertyDescription:
   *                 type: string
   *                 description: Medical condition type property description
   *                 required: false
   *               medicalConditionTypePropertyDataType:
   *                 type: string
   *                 description: Medical condition type property data type
   *                 required: false
   *               medicalConditionTypePropertyRequired:
   *                 type: number
   *                 description: Medical condition type property required flag
   *                 required: false
   *               medicalConditionTypeId:
   *                 type: number
   *                 description: Medical condition type ID
   *                 required: false
   *               medicalConditionTypePropertyActive:
   *                 type: number
   *                 description: Medical condition type property status
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
      const medicalConditionTypePropertyService = new MedicalConditionTypePropertyService()
      let inputs = request.all()
      inputs = medicalConditionTypePropertyService.sanitizeInput(inputs)
      await request.validateUsing(updateMedicalConditionTypePropertyValidator)

      const medicalConditionTypePropertyId = request.param('medicalConditionTypePropertyId')
      if (!medicalConditionTypePropertyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyId },
        }
      }

      const currentMedicalConditionTypeProperty = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .where('medical_condition_type_property_id', medicalConditionTypePropertyId)
        .first()

      if (!currentMedicalConditionTypeProperty) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property was not found',
          message: 'The medical condition type property was not found with the entered ID',
          data: { medicalConditionTypePropertyId },
        }
      }

      const medicalConditionTypeProperty = {
        medicalConditionTypePropertyId: medicalConditionTypePropertyId,
        medicalConditionTypePropertyName: inputs['medicalConditionTypePropertyName'] || currentMedicalConditionTypeProperty.medicalConditionTypePropertyName,
        medicalConditionTypePropertyDescription: inputs['medicalConditionTypePropertyDescription'] || currentMedicalConditionTypeProperty.medicalConditionTypePropertyDescription,
        medicalConditionTypePropertyDataType: inputs['medicalConditionTypePropertyDataType'] || currentMedicalConditionTypeProperty.medicalConditionTypePropertyDataType,
        medicalConditionTypePropertyRequired: inputs['medicalConditionTypePropertyRequired'] !== undefined ? inputs['medicalConditionTypePropertyRequired'] : currentMedicalConditionTypeProperty.medicalConditionTypePropertyRequired,
        medicalConditionTypeId: inputs['medicalConditionTypeId'] || currentMedicalConditionTypeProperty.medicalConditionTypeId,
        medicalConditionTypePropertyActive: inputs['medicalConditionTypePropertyActive'] !== undefined ? inputs['medicalConditionTypePropertyActive'] : currentMedicalConditionTypeProperty.medicalConditionTypePropertyActive,
      } as MedicalConditionTypeProperty

      const isValidInfo = await medicalConditionTypePropertyService.verifyInfo(medicalConditionTypeProperty)
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

      const updateMedicalConditionTypeProperty = await medicalConditionTypePropertyService.update(
        currentMedicalConditionTypeProperty,
        medicalConditionTypeProperty
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Medical condition type property',
        message: 'The medical condition type property was updated successfully',
        data: { medicalConditionTypeProperty: updateMedicalConditionTypeProperty },
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
   * /api/medical-condition-type-properties/{medicalConditionTypePropertyId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Properties
   *     summary: delete medical condition type property
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyId
   *         schema:
   *           type: number
   *         description: Medical condition type property id
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
      const medicalConditionTypePropertyId = request.param('medicalConditionTypePropertyId')
      if (!medicalConditionTypePropertyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyId },
        }
      }

      const currentMedicalConditionTypeProperty = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .where('medical_condition_type_property_id', medicalConditionTypePropertyId)
        .first()

      if (!currentMedicalConditionTypeProperty) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property was not found',
          message: 'The medical condition type property was not found with the entered ID',
          data: { medicalConditionTypePropertyId },
        }
      }

      const medicalConditionTypePropertyService = new MedicalConditionTypePropertyService()
      const deleteMedicalConditionTypeProperty = await medicalConditionTypePropertyService.delete(currentMedicalConditionTypeProperty)
      if (deleteMedicalConditionTypeProperty) {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type property',
          message: 'The medical condition type property was deleted successfully',
          data: { medicalConditionTypeProperty: deleteMedicalConditionTypeProperty },
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
   * /api/medical-condition-type-properties/{medicalConditionTypePropertyId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Properties
   *     summary: get medical condition type property by id
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyId
   *         schema:
   *           type: number
   *         description: Medical condition type property id
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
      const medicalConditionTypePropertyId = request.param('medicalConditionTypePropertyId')
      if (!medicalConditionTypePropertyId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyId },
        }
      }

      const medicalConditionTypePropertyService = new MedicalConditionTypePropertyService()
      const showMedicalConditionTypeProperty = await medicalConditionTypePropertyService.show(medicalConditionTypePropertyId)
      if (!showMedicalConditionTypeProperty) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property was not found',
          message: 'The medical condition type property was not found with the entered ID',
          data: { medicalConditionTypePropertyId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type property',
          message: 'The medical condition type property was found successfully',
          data: { showMedicalConditionTypeProperty: showMedicalConditionTypeProperty },
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
   * /api/medical-condition-type-properties/type/{medicalConditionTypeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Properties
   *     summary: get medical condition type properties by type id
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
  async getByType({ request, response }: HttpContext) {
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

      const medicalConditionTypeProperties = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .where('medical_condition_type_id', medicalConditionTypeId)
        .preload('medicalConditionType')

      response.status(200)
      return {
        type: 'success',
        title: 'Medical condition type properties',
        message: 'The medical condition type properties were found successfully',
        data: {
          medicalConditionTypeId: medicalConditionTypeId,
          medicalConditionTypeProperties: medicalConditionTypeProperties
        },
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
