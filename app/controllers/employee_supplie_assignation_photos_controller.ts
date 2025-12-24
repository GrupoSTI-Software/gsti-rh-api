import type { HttpContext } from '@adonisjs/core/http'
import EmployeeSuppplyAssignamentPhotoService from '#services/employee_suppply_assignament_photo_service'
import UploadService from '#services/upload_service'
import { uploadPhotoValidator } from '#validators/employee_supply_assignament_photo'
import { inject } from '@adonisjs/core'

export default class EmployeeSupplieAssignationPhotosController {
  /**
   * @swagger
   * /api/employee-supply-assignation-photos/{employeeSupplyId}/assignation:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Supply Assignation Photos
   *     summary: Upload assignation photos for an employee supply
   *     description: Uploads one or more photos as assignation type for an employee supply
   *     parameters:
   *       - in: path
   *         name: employeeSupplyId
   *         required: true
   *         schema:
   *           type: number
   *         description: Employee supply ID
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photos:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                 description: One or more photo files to upload
   *     responses:
   *       201:
   *         description: Photos uploaded successfully
   *       400:
   *         description: Bad request
   *       404:
   *         description: Employee supply not found
   */
  @inject()
  async uploadAssignation(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeSupplyId = request.param('employeeSupplyId')
      await request.validateUsing(uploadPhotoValidator, {
        data: { employeeSupplyId: Number.parseInt(employeeSupplyId) },
      })

      const validationOptions = {
        types: ['image'],
        size: '5mb',
      }

      const photos = request.files('photos', validationOptions)

      if (!photos || photos.length === 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing photos',
          message: 'Please upload at least one photo',
          data: null,
        }
      }

      const service = new EmployeeSuppplyAssignamentPhotoService()
      const result = await service.uploadPhotos(
        Number.parseInt(employeeSupplyId),
        photos,
        'assignation',
        uploadService
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
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
   * /api/employee-supply-assignation-photos/{employeeSupplyId}/return:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Supply Assignation Photos
   *     summary: Upload return photos for an employee supply
   *     description: Uploads one or more photos as return type for an employee supply
   *     parameters:
   *       - in: path
   *         name: employeeSupplyId
   *         required: true
   *         schema:
   *           type: number
   *         description: Employee supply ID
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photos:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                 description: One or more photo files to upload
   *     responses:
   *       201:
   *         description: Photos uploaded successfully
   *       400:
   *         description: Bad request
   *       404:
   *         description: Employee supply not found
   */
  @inject()
  async uploadReturn(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeSupplyId = request.param('employeeSupplyId')
      await request.validateUsing(uploadPhotoValidator, {
        data: { employeeSupplyId: Number.parseInt(employeeSupplyId) },
      })

      const validationOptions = {
        types: ['image'],
        size: '5mb',
      }

      const photos = request.files('photos', validationOptions)

      if (!photos || photos.length === 0) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing photos',
          message: 'Please upload at least one photo',
          data: null,
        }
      }

      const service = new EmployeeSuppplyAssignamentPhotoService()
      const result = await service.uploadPhotos(
        Number.parseInt(employeeSupplyId),
        photos,
        'return',
        uploadService
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
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
   * /api/employee-supply-assignation-photos/{employeeSupplyId}/assignation:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Supply Assignation Photos
   *     summary: Get assignation photos for an employee supply
   *     parameters:
   *       - in: path
   *         name: employeeSupplyId
   *         required: true
   *         schema:
   *           type: number
   *         description: Employee supply ID
   *     responses:
   *       200:
   *         description: Photos retrieved successfully
   *       404:
   *         description: Employee supply not found
   */
  async getAssignation({ request, response }: HttpContext) {
    try {
      const employeeSupplyId = request.param('employeeSupplyId')

      const service = new EmployeeSuppplyAssignamentPhotoService()
      const result = await service.getPhotosByType(
        Number.parseInt(employeeSupplyId),
        'assignation'
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
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
   * /api/employee-supply-assignation-photos/{employeeSupplyId}/return:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Supply Assignation Photos
   *     summary: Get return photos for an employee supply
   *     parameters:
   *       - in: path
   *         name: employeeSupplyId
   *         required: true
   *         schema:
   *           type: number
   *         description: Employee supply ID
   *     responses:
   *       200:
   *         description: Photos retrieved successfully
   *       404:
   *         description: Employee supply not found
   */
  async getReturn({ request, response }: HttpContext) {
    try {
      const employeeSupplyId = request.param('employeeSupplyId')

      const service = new EmployeeSuppplyAssignamentPhotoService()
      const result = await service.getPhotosByType(
        Number.parseInt(employeeSupplyId),
        'return'
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
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
   * /api/employee-supply-assignation-photos/{photoId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Supply Assignation Photos
   *     summary: Delete a photo
   *     description: Deletes a photo from the database and S3
   *     parameters:
   *       - in: path
   *         name: photoId
   *         required: true
   *         schema:
   *           type: number
   *         description: Photo ID
   *     responses:
   *       200:
   *         description: Photo deleted successfully
   *       404:
   *         description: Photo not found
   */
  @inject()
  async delete(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const photoId = request.param('photoId')

      const service = new EmployeeSuppplyAssignamentPhotoService()
      const result = await service.deletePhoto(
        Number.parseInt(photoId),
        uploadService
      )

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
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
