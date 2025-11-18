import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import MedicalConditionTypePropertyValueService from '#services/medical_condition_type_property_value_service'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'
import {
  createMedicalConditionTypePropertyValueValidator,
  updateMedicalConditionTypePropertyValueValidator,
} from '#validators/medical_condition_type_property_value'

export default class MedicalConditionTypePropertyValueController {
  /**
   * @swagger
   * /api/medical-condition-type-property-values:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Property Values
   *     summary: get all medical condition type property values
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
      const medicalConditionTypePropertyValues = await MedicalConditionTypePropertyValue.query()
        .whereNull('medical_condition_type_property_value_deleted_at')
        .preload('medicalConditionTypeProperty')
        .preload('employeeMedicalCondition', (query) => {
          query.preload('employee', (subQuery) => {
            subQuery.preload('person')
          })
          query.preload('medicalConditionType')
        })
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: medicalConditionTypePropertyValues,
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
   * /api/medical-condition-type-property-values:
   *   post:
   *     summary: Create a medical condition type property value
   *     tags:
   *       - Medical Condition Type Property Values
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypePropertyId:
   *                 type: number
   *                 description: Medical condition type property ID
   *                 required: true
   *               employeeMedicalConditionId:
   *                 type: number
   *                 description: Employee medical condition ID
   *                 required: true
   *               medicalConditionTypePropertyValue:
   *                 type: string
   *                 description: Property value
   *                 required: true
   *               medicalConditionTypePropertyValueActive:
   *                 type: number
   *                 description: Property value status
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
      const medicalConditionTypePropertyValueService = new MedicalConditionTypePropertyValueService()
      let inputs = request.all()
      inputs = medicalConditionTypePropertyValueService.sanitizeInput(inputs)
      await request.validateUsing(createMedicalConditionTypePropertyValueValidator)

      const medicalConditionTypePropertyValue = {
        medicalConditionTypePropertyId: inputs['medicalConditionTypePropertyId'],
        employeeMedicalConditionId: inputs['employeeMedicalConditionId'],
        medicalConditionTypePropertyValue: inputs['medicalConditionTypePropertyValue'],
        medicalConditionTypePropertyValueActive: inputs['medicalConditionTypePropertyValueActive'] || 1,
      } as MedicalConditionTypePropertyValue

      const isValidInfo = await medicalConditionTypePropertyValueService.verifyInfo(medicalConditionTypePropertyValue)
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

      const newMedicalConditionTypePropertyValue = await medicalConditionTypePropertyValueService.create(medicalConditionTypePropertyValue)
      response.status(201)
      return {
        type: 'success',
        title: 'Medical condition type property value',
        message: 'The medical condition type property value was created successfully',
        data: { medicalConditionTypePropertyValue: newMedicalConditionTypePropertyValue },
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
   * /api/medical-condition-type-property-values/{medicalConditionTypePropertyValueId}:
   *   put:
   *     summary: Update a medical condition type property value
   *     tags:
   *       - Medical Condition Type Property Values
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Medical condition type property value id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               medicalConditionTypePropertyId:
   *                 type: number
   *                 description: Medical condition type property ID
   *                 required: false
   *               employeeMedicalConditionId:
   *                 type: number
   *                 description: Employee medical condition ID
   *                 required: false
   *               medicalConditionTypePropertyValue:
   *                 type: string
   *                 description: Property value
   *                 required: false
   *               medicalConditionTypePropertyValueActive:
   *                 type: number
   *                 description: Property value status
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
      const medicalConditionTypePropertyValueService = new MedicalConditionTypePropertyValueService()
      let inputs = request.all()
      inputs = medicalConditionTypePropertyValueService.sanitizeInput(inputs)
      await request.validateUsing(updateMedicalConditionTypePropertyValueValidator)

      const medicalConditionTypePropertyValueId = request.param('medicalConditionTypePropertyValueId')
      if (!medicalConditionTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property value Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyValueId },
        }
      }

      const currentMedicalConditionTypePropertyValue = await MedicalConditionTypePropertyValue.query()
        .whereNull('medical_condition_type_property_value_deleted_at')
        .where('medical_condition_type_property_value_id', medicalConditionTypePropertyValueId)
        .first()

      if (!currentMedicalConditionTypePropertyValue) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property value was not found',
          message: 'The medical condition type property value was not found with the entered ID',
          data: { medicalConditionTypePropertyValueId },
        }
      }

      const medicalConditionTypePropertyValue = {
        medicalConditionTypePropertyValueId: medicalConditionTypePropertyValueId,
        medicalConditionTypePropertyId: inputs['medicalConditionTypePropertyId'] || currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyId,
        employeeMedicalConditionId: inputs['employeeMedicalConditionId'] || currentMedicalConditionTypePropertyValue.employeeMedicalConditionId,
        medicalConditionTypePropertyValue: inputs['medicalConditionTypePropertyValue'] || currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyValue,
        medicalConditionTypePropertyValueActive: inputs['medicalConditionTypePropertyValueActive'] !== undefined ? inputs['medicalConditionTypePropertyValueActive'] : currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyValueActive,
      } as MedicalConditionTypePropertyValue

      const isValidInfo = await medicalConditionTypePropertyValueService.verifyInfo(medicalConditionTypePropertyValue)
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

      const updateMedicalConditionTypePropertyValue = await medicalConditionTypePropertyValueService.update(
        currentMedicalConditionTypePropertyValue,
        medicalConditionTypePropertyValue
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Medical condition type property value',
        message: 'The medical condition type property value was updated successfully',
        data: { medicalConditionTypePropertyValue: updateMedicalConditionTypePropertyValue },
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
   * /api/medical-condition-type-property-values/{medicalConditionTypePropertyValueId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Property Values
   *     summary: delete medical condition type property value
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Medical condition type property value id
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
      const medicalConditionTypePropertyValueId = request.param('medicalConditionTypePropertyValueId')
      if (!medicalConditionTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property value Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyValueId },
        }
      }

      const currentMedicalConditionTypePropertyValue = await MedicalConditionTypePropertyValue.query()
        .whereNull('medical_condition_type_property_value_deleted_at')
        .where('medical_condition_type_property_value_id', medicalConditionTypePropertyValueId)
        .first()

      if (!currentMedicalConditionTypePropertyValue) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property value was not found',
          message: 'The medical condition type property value was not found with the entered ID',
          data: { medicalConditionTypePropertyValueId },
        }
      }

      const medicalConditionTypePropertyValueService = new MedicalConditionTypePropertyValueService()
      const deleteMedicalConditionTypePropertyValue = await medicalConditionTypePropertyValueService.delete(currentMedicalConditionTypePropertyValue)
      if (deleteMedicalConditionTypePropertyValue) {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type property value',
          message: 'The medical condition type property value was deleted successfully',
          data: { medicalConditionTypePropertyValue: deleteMedicalConditionTypePropertyValue },
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
   * /api/medical-condition-type-property-values/{medicalConditionTypePropertyValueId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Medical Condition Type Property Values
   *     summary: get medical condition type property value by id
   *     parameters:
   *       - in: path
   *         name: medicalConditionTypePropertyValueId
   *         schema:
   *           type: number
   *         description: Medical condition type property value id
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
      const medicalConditionTypePropertyValueId = request.param('medicalConditionTypePropertyValueId')
      if (!medicalConditionTypePropertyValueId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The medical condition type property value Id was not found',
          message: 'Missing data to process',
          data: { medicalConditionTypePropertyValueId },
        }
      }

      const medicalConditionTypePropertyValueService = new MedicalConditionTypePropertyValueService()
      const showMedicalConditionTypePropertyValue = await medicalConditionTypePropertyValueService.show(medicalConditionTypePropertyValueId)
      if (!showMedicalConditionTypePropertyValue) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The medical condition type property value was not found',
          message: 'The medical condition type property value was not found with the entered ID',
          data: { medicalConditionTypePropertyValueId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Medical condition type property value',
          message: 'The medical condition type property value was found successfully',
          data: { showMedicalConditionTypePropertyValue: showMedicalConditionTypePropertyValue },
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
