import Employee from '#models/employee'
import EmployeeBiometricFaceIdService from '#services/employee_biometric_face_id_service'
import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'

export default class EmployeeBiometricFaceIdController {
  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Upload a biometric face photo for an employee
   *     description: Uploads a biometric face photo for an employee. If the employee already has a photo, it will be replaced.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The biometric face photo file to upload (must be an image)
   *     responses:
   *       200:
   *         description: Photo uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto subida
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue subida exitosamente
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeBiometricFaceId:
   *                       $ref: '#/components/schemas/EmployeeBiometricFaceId'
   *       201:
   *         description: Photo created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto creada
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue creada exitosamente
   *                 data:
   *                   type: object
   *       400:
   *         description: Bad Request - Invalid file or missing photo
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Error de validación
   *                 message:
   *                   type: string
   *       404:
   *         description: Employee not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                   example: Empleado no encontrado
   *                 message:
   *                   type: string
   *       500:
   *         description: Internal Server Error
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
   *                 error:
   *                   type: string
   */
  @inject()
  async uploadPhoto(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      // Validar que el empleado existe
      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'El empleado no fue encontrado con el ID proporcionado',
          data: { employeeId },
        }
      }

      // Validar que se subió un archivo
      const validationOptions = {
        types: ['image'],
        size: '2mb',
      }
      const photo = request.file('photo', validationOptions)

      if (!photo) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'Por favor sube una foto. El archivo debe ser una imagen.',
          data: null,
        }
      }

      // Generar nombre único para el archivo
      const fileName = `${new Date().getTime()}_${photo.clientName || 'biometric_face'}`

      // Subir la foto al S3
      const photoUrl = await uploadService.fileUpload(photo, 'employee-biometric-faces', fileName, 'private')
      if (!photoUrl || photoUrl === 'file_not_found' || photoUrl === 'S3Producer.fileUpload') {
        response.status(500)
        return {
          type: 'error',
          title: 'Error al subir archivo',
          message: 'Ocurrió un error al subir la foto al almacenamiento',
          data: null,
        }
      }

      // Crear o actualizar el registro
      const service = new EmployeeBiometricFaceIdService()
      const existingRecord = await service.findByEmployeeId(employeeId)

      let result
      if (existingRecord) {
        // Si ya existe, eliminar la foto anterior del S3 y actualizar
        if (existingRecord.employeeBiometricFaceIdPhotoUrl) {
          await uploadService.deleteFile(existingRecord.employeeBiometricFaceIdPhotoUrl)
        }
        result = await service.update(existingRecord, photoUrl)
        response.status(200)
        return {
          type: 'success',
          title: 'Foto reemplazada',
          message: 'La foto biométrica fue reemplazada exitosamente',
          data: { employeeBiometricFaceId: result },
        }
      } else {
        // Si no existe, crear nuevo registro
        result = await service.create(employeeId, photoUrl)
        response.status(201)
        return {
          type: 'success',
          title: 'Foto creada',
          message: 'La foto biométrica fue creada exitosamente',
          data: { employeeBiometricFaceId: result },
        }
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al subir la foto biométrica',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Replace a biometric face photo for an employee
   *     description: Deletes the existing biometric face photo from S3 and replaces it with a new one
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The new biometric face photo file to upload (must be an image)
   *     responses:
   *       200:
   *         description: Photo replaced successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto reemplazada
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue reemplazada exitosamente
   *                 data:
   *                   type: object
   *       201:
   *         description: Photo created successfully (if no previous photo existed)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto creada
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue creada exitosamente
   *                 data:
   *                   type: object
   *       400:
   *         description: Bad Request - Invalid file or missing photo
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
   *       404:
   *         description: Employee not found
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
   *       500:
   *         description: Internal Server Error
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
   *                 error:
   *                   type: string
   */
  @inject()
  async replacePhoto(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      // Validar que el empleado existe
      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'El empleado no fue encontrado con el ID proporcionado',
          data: { employeeId },
        }
      }

      // Validar que se subió un archivo
      const validationOptions = {
        types: ['image'],
        size: '2mb',
      }
      const photo = request.file('photo', validationOptions)

      if (!photo) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'Por favor sube una foto. El archivo debe ser una imagen.',
          data: null,
        }
      }

      // Generar nombre único para el archivo
      const fileName = `${new Date().getTime()}_${photo.clientName || 'biometric_face'}`

      // Subir la nueva foto al S3
      const photoUrl = await uploadService.fileUpload(photo, 'employee-biometric-faces', fileName, 'private')
      if (!photoUrl || photoUrl === 'file_not_found' || photoUrl === 'S3Producer.fileUpload') {
        response.status(500)
        return {
          type: 'error',
          title: 'Error al subir archivo',
          message: 'Ocurrió un error al subir la foto al almacenamiento',
          data: null,
        }
      }

      // Reemplazar la foto (elimina la anterior del S3 y crea/actualiza con la nueva)
      const service = new EmployeeBiometricFaceIdService()
      const result = await service.replacePhoto(employeeId, photoUrl, uploadService)

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
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al reemplazar la foto biométrica',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Delete a biometric face photo for an employee
   *     description: Deletes the biometric face photo from both the database and S3 storage
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *     responses:
   *       200:
   *         description: Photo deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto eliminada
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue eliminada exitosamente
   *                 data:
   *                   type: object
   *       404:
   *         description: Employee or photo not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                   example: Foto no encontrada
   *                 message:
   *                   type: string
   *                   example: No se encontró una foto biométrica para este empleado
   *       400:
   *         description: Bad Request - Missing employee ID
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
   *       500:
   *         description: Internal Server Error
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
   *                 error:
   *                   type: string
   */
  @inject()
  async deletePhoto(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      // Validar que el empleado existe
      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'El empleado no fue encontrado con el ID proporcionado',
          data: { employeeId },
        }
      }

      // Buscar el registro de foto biométrica
      const service = new EmployeeBiometricFaceIdService()
      const biometricFaceId = await service.findByEmployeeId(employeeId)

      if (!biometricFaceId) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Foto no encontrada',
          message: 'No se encontró una foto biométrica para este empleado',
          data: { employeeId },
        }
      }

      // Eliminar la foto del S3 y el registro de la base de datos
      const result = await service.deletePhotoAndRecord(biometricFaceId, uploadService)

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
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al eliminar la foto biométrica',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Get the biometric face photo for an employee
   *     description: Retrieves the biometric face photo information for a specific employee
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *     responses:
   *       200:
   *         description: Photo retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Foto encontrada
   *                 message:
   *                   type: string
   *                   example: La foto biométrica fue encontrada exitosamente
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeBiometricFaceId:
   *                       $ref: '#/components/schemas/EmployeeBiometricFaceId'
   *       404:
   *         description: Employee or photo not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: warning
   *                 title:
   *                   type: string
   *                   example: Foto no encontrada
   *                 message:
   *                   type: string
   *                   example: No se encontró una foto biométrica para este empleado
   *       400:
   *         description: Bad Request - Missing employee ID
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
   *       500:
   *         description: Internal Server Error
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
   *                 error:
   *                   type: string
   */
  @inject()
  async getPhoto(
    { request, response }: HttpContext,
    uploadService: UploadService
  ) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }

      // Validar que el empleado existe
      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .whereNull('employee_deleted_at')
        .first()

      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'El empleado no fue encontrado con el ID proporcionado',
          data: { employeeId },
        }
      }

      // Buscar el registro de foto biométrica
      const service = new EmployeeBiometricFaceIdService()
      const biometricFaceId = await service.findByEmployeeId(employeeId)

      if (!biometricFaceId) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Foto no encontrada',
          message: 'No se encontró una foto biométrica para este empleado',
          data: { employeeId },
        }
      }

      const photoUrl = await uploadService.getDownloadLink(biometricFaceId.employeeBiometricFaceIdPhotoUrl)
      if (typeof photoUrl === 'string') {
        biometricFaceId.employeeBiometricFaceIdPhotoUrl = photoUrl
      }
      
      response.status(200)
      return {
        type: 'success',
        title: 'Foto encontrada',
        message: 'La foto biométrica fue encontrada exitosamente',
        data: { employeeBiometricFaceId: biometricFaceId },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener la foto biométrica',
        error: error.message,
      }
    }
  }
}

