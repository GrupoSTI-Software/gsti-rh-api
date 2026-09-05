import Employee from '#models/employee'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import EmployeeBiometricFaceIdService from '#services/employee_biometric_face_id_service'
import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
import { checkEmployeeBiometricFaceIdQuality } from '#helpers/employee_biometric_face_id_quality'
import { ensureEmployeeBiometricRead } from '#helpers/ensure_employee_biometric_read'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { ensureBiometricFaceToPhotoCopy } from '#helpers/ensure_biometric_face_to_photo_copy'
import EmployeeService from '#services/employee_service'
import PiiAccessLogService from '#services/pii_access_log_service'

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
   *               quality:
   *                 type: integer
   *                 minimum: 0
   *                 maximum: 100
   *                 description: Confianza de detección facial medida por el cliente sobre esta imagen. Opcional; ausente o fuera de rango se guarda como null.
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  @inject()
  async uploadPhoto(
    ctx: HttpContext,
    uploadService: UploadService
  ) {
    const { request, response } = ctx
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
        size: '5mb',
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

      // Corte de admisión por calidad. Va ANTES de tocar S3: rechazar después
      // de subir dejaría un objeto privado huérfano en el bucket, sin fila que
      // lo referencie y sin nada que lo recoja.
      const qualityCheck = checkEmployeeBiometricFaceIdQuality(request.input('quality'))
      if (!qualityCheck.accepted) {
        return response.status(qualityCheck.rejection.status).json(qualityCheck.rejection.body)
      }
      const quality = qualityCheck.quality

      // Subir la foto al S3
      const photoUrl = await uploadService.fileUpload(photo, 'profile-photo', 'employee-biometric-faces')
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
        // Guardar primero, borrar después: si el guardado falla por permiso de
        // categoría sensible, la foto anterior en S3 no debe perderse.
        const oldPhotoUrl = existingRecord.employeeBiometricFaceIdPhotoUrl
        result = await service.update(existingRecord, photoUrl, quality)
        if (oldPhotoUrl) {
          await uploadService.deleteFile(oldPhotoUrl)
        }
        response.status(200)
        return {
          type: 'success',
          title: 'Foto reemplazada',
          message: 'La foto biométrica fue reemplazada exitosamente',
          data: { employeeBiometricFaceId: result },
        }
      } else {
        // Si no existe, crear nuevo registro
        result = await service.create(employeeId, photoUrl, quality)
        response.status(201)
        return {
          type: 'success',
          title: 'Foto creada',
          message: 'La foto biométrica fue creada exitosamente',
          data: { employeeBiometricFaceId: result },
        }
      }
    } catch (error: any) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
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
   *               quality:
   *                 type: integer
   *                 minimum: 0
   *                 maximum: 100
   *                 description: Confianza de detección facial medida por el cliente sobre esta imagen. Opcional; ausente o fuera de rango se guarda como null.
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  @inject()
  async replacePhoto(
    ctx: HttpContext,
    uploadService: UploadService
  ) {
    const { request, response } = ctx
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
        size: '5mb',
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

      // Corte de admisión por calidad, antes de subir nada: además de no dejar
      // huérfanos en S3, así una foto rechazada nunca borra la anterior.
      const qualityCheck = checkEmployeeBiometricFaceIdQuality(request.input('quality'))
      if (!qualityCheck.accepted) {
        return response.status(qualityCheck.rejection.status).json(qualityCheck.rejection.body)
      }
      const quality = qualityCheck.quality

      // Subir la nueva foto al S3
      const photoUrl = await uploadService.fileUpload(photo, 'profile-photo', 'employee-biometric-faces')
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
      const result = await service.replacePhoto(employeeId, photoUrl, uploadService, quality)

      response.status(result.status)
      return {
        type: result.type,
        title: result.title,
        message: result.message,
        data: result.data,
      }
    } catch (error: any) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
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
   *     description: |
   *       Retrieves the biometric face photo information for a specific employee.
   *       Campos employeeBiometricFaceIdPhotoUrl y employeeBiometricFaceIdToken:
   *       Puede llegar enmascarado según el permiso de lectura de su categoría.
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
  async getPhoto(ctx: HttpContext, uploadService: UploadService) {
    const { request, response } = ctx
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

      // Solo el dueño de la foto pasa sin permiso de administración.
      if (
        !(await ensureEmployeeBiometricRead(
          ctx,
          Number(employeeId),
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricFaceId
        ))
      ) {
        return
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

  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id-with-token/{token}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Get the biometric face photo for an employee with token
   *     description: Retrieves the biometric face photo information for a specific employee
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *         description: Token of the biometric face photo
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
   *         description: Employee or photo or token not found
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
   *                   example: No se encontró una foto biométrica para este empleado o el token no es válido
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
   *       '403':
   *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string, example: Sin permiso para modificar datos sensibles }
   *                 detail: { type: string, example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó. }
   *                 key: { type: string, example: sin-permiso-para-modificar-datos-sensibles }
   *                 code: { type: string, example: EMP.SENS.WRITE.FORBIDDEN }
   */
  @inject()
  async getPhotoToken(ctx: HttpContext, uploadService: UploadService) {
    const { request, response } = ctx
    try {
      const employeeId = request.param('employeeId')
      const token = request.param('token')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId },
        }
      }
      if (!token) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El token es requerido',
          data: { token },
        }
      }

      // Solo el dueño de la foto pasa sin permiso de administración.
      if (
        !(await ensureEmployeeBiometricRead(
          ctx,
          Number(employeeId),
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricFaceIdWithToken
        ))
      ) {
        return
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
      const employeeBiometricService = new EmployeeBiometricFaceIdService()
      const biometricFaceId = await employeeBiometricService.findByEmployeeId(employeeId)

      if (!biometricFaceId) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Foto no encontrada',
          message: 'No se encontró una foto biométrica para este empleado',
          data: { employeeId },
        }
      }

      // Solo se informa si el token del cliente coincide con el guardado. Antes
      // se sobrescribía el de la base con el que mandara quien preguntara: una
      // escritura sin autorización sobre el registro de cualquier empleado. El
      // campo nunca autorizó nada —la invalidación de caché va por updatedAt— y
      // ningún cliente lee `sameToken` hoy.
      const sameToken = biometricFaceId.employeeBiometricFaceIdToken === token

      const photoUrl = await uploadService.getDownloadLink(biometricFaceId.employeeBiometricFaceIdPhotoUrl)
      if (typeof photoUrl === 'string') {
        biometricFaceId.employeeBiometricFaceIdPhotoUrl = photoUrl
      }

      // Path relativo al proxy server-side. El cliente concatena con su baseUrl
      // (que ya apunta al API y aplica el Bearer automáticamente). Evita exponer
      // URLs firmadas de DigitalOcean Spaces, que en algunas redes corporativas
      // están filtradas a nivel DNS.
      const employeeBiometricFaceIdPhotoUrlProxy = `/api/employees/${employeeId}/biometric-face-id-photo`

      response.status(200)
      return {
        type: 'success',
        title: 'Foto encontrada',
        message: 'La foto biométrica fue encontrada exitosamente',
        data: {
          employeeBiometricFaceId: biometricFaceId,
          sameToken: sameToken,
          photoUrlProxy: employeeBiometricFaceIdPhotoUrlProxy,
        },
      }
    } catch (error: any) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al obtener la foto biométrica',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/biometric-face-id/use-as-photo:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Biometric Face ID
   *     summary: Use the biometric face photo as the employee profile photo
   *     description: |
   *       Copia el rostro biométrico del colaborador dentro del mismo bucket y guarda
   *       la copia como su foto de perfil. No recibe archivo: el origen es siempre la
   *       foto biométrica ya registrada, así que no hay forma de inyectar una imagen
   *       distinta por esta vía.
   *
   *       La operación cruza dos categorías de dato, por lo que exige AMBOS permisos
   *       —`tab-biometricos-read` y `tab-foto-write`— evaluados sin el interruptor de
   *       exigencia del módulo, y deja asiento en la bitácora de accesos a datos
   *       personales (`pii_access_logs`) sobre la columna biométrica de origen.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *         description: ID of the employee
   *     responses:
   *       200:
   *         description: Profile photo updated from the biometric face photo
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string, example: Foto de perfil actualizada }
   *                 message: { type: string, example: La foto biométrica ahora es la foto de perfil del colaborador }
   *                 data:
   *                   type: object
   *                   properties:
   *                     employee: { type: object }
   *       403:
   *         description: Sin permiso de lectura biométrica o sin permiso de escritura de la foto.
   *       404:
   *         description: Employee or biometric photo not found
   *       500:
   *         description: Internal Server Error
   */
  @inject()
  async useAsEmployeePhoto(ctx: HttpContext, uploadService: UploadService) {
    const { request, response, i18n } = ctx
    try {
      const employeeId = Number(request.param('employeeId'))

      if (!Number.isInteger(employeeId) || employeeId <= 0) {
        response.status(400)
        return {
          type: 'error',
          title: 'Error de validación',
          message: 'El ID del empleado es requerido',
          data: { employeeId: request.param('employeeId') },
        }
      }

      // Los DOS permisos antes de leer nada: el gate del router solo cubre la
      // escritura de la foto y ademas pasa por `evaluate`, que concede mientras
      // el modulo `employees` tenga la exigencia apagada.
      const permitido = await ensureBiometricFaceToPhotoCopy(
        ctx,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricFaceId,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.useEmployeeFaceIdAsPhoto
      )
      if (!permitido) return

      // `Employee` lleva `withBusinessUnitScope`: esta consulta ya esta acotada
      // a la unidad activa de la sesion, no hace falta filtrarla a mano.
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

      const service = new EmployeeBiometricFaceIdService()
      const biometricFaceId = await service.findByEmployeeId(employeeId)
      const sourcePhotoUrl = biometricFaceId?.employeeBiometricFaceIdPhotoUrl

      if (!biometricFaceId || !sourcePhotoUrl) {
        response.status(404)
        return {
          type: 'warning',
          title: 'Foto no encontrada',
          message: 'No se encontró una foto biométrica para este empleado',
          data: { employeeId },
        }
      }

      // El asiento se escribe ANTES de copiar. La bitacora tiene que registrar
      // el intento de sacar el rostro de su categoria aunque el bucket falle
      // despues: si se dejara para el final, un fallo de S3 borraria la huella
      // de que alguien pidio el dato biometrico.
      await new PiiAccessLogService().record({
        businessUnitId: currentEmployee.businessUnitId,
        accessorUserId: ctx.auth.user!.userId,
        model: 'EmployeeBiometricFaceId',
        modelColumn: 'employeeBiometricFaceIdPhotoUrl',
        recordId: biometricFaceId.employeeBiometricFaceIdId,
        accessorIp: request.ip(),
        accessorUserAgent: request.header('User-Agent') ?? null,
        requestId: request.id() ?? null,
      })

      // Copia dentro del bucket: los bytes no vuelven a salir por la red y no
      // hay archivo de entrada que validar. El perfil destino es el mismo con
      // el que se guardo el rostro, solo cambia la carpeta.
      const photoUrl = await uploadService.copyStoredObject(
        sourcePhotoUrl,
        'profile-photo',
        'employees'
      )

      if (!photoUrl) {
        response.status(500)
        return {
          type: 'error',
          title: 'Foto no copiada',
          message: 'No fue posible copiar la foto biométrica. Intenta de nuevo.',
          data: null,
        }
      }

      // Guardar primero, borrar despues: mismo orden que en `uploadPhoto`. Si
      // el guardado falla por permiso de categoria sensible, la foto anterior
      // del colaborador sigue en el bucket y su fila sigue apuntando a ella.
      const previousPhotoUrl = currentEmployee.employeePhoto
      const employee = await new EmployeeService(i18n).updateEmployeePhotoUrl(employeeId, photoUrl)

      if (!employee) {
        // La fila desaparecio entre la lectura y el guardado. La copia recien
        // hecha ya no la referencia nadie: se retira para no dejarla huerfana.
        await uploadService.deleteFile(photoUrl)
        response.status(404)
        return {
          type: 'warning',
          title: 'Empleado no encontrado',
          message: 'El empleado no fue encontrado con el ID proporcionado',
          data: { employeeId },
        }
      }

      // El rostro biometrico NO se toca: sigue siendo el original en su carpeta
      // y su fila. Lo que se retira es la foto de perfil anterior, que acaba de
      // quedar sin referencia.
      if (previousPhotoUrl && previousPhotoUrl !== photoUrl) {
        await uploadService.deleteFile(previousPhotoUrl)
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Foto de perfil actualizada',
        message: 'La foto biométrica ahora es la foto de perfil del colaborador',
        data: { employee },
      }
    } catch (error: any) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        message: 'Ocurrió un error inesperado al usar la foto biométrica como foto de perfil',
        error: error.message,
      }
    }
  }
}
