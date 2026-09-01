import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import ShiftExceptionEvidenceService from '#services/shift_exception_evidence_service'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import Env from '#start/env'
import path from 'node:path'
export default class ShiftExceptionEvidenceController {
  /**
   * @swagger
   * /api/shift-exception-evidences:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Shift Exception Evidences
   *     summary: get all shift exception evidences
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

  async index({ response }: HttpContext) {
    try {
      // Pasa por el servicio para heredar el filtro de tenant: consultar el
      // modelo directo devolvia las evidencias de todas las empresas.
      const shiftExceptionEvidences = await new ShiftExceptionEvidenceService().index()
      return response.status(200).json({
        type: 'success',
        title: 'Successfully action',
        message: 'Resources were found successfully',
        data: shiftExceptionEvidences,
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
   * /api/shift-exception-evidences/:
   *   post:
   *     summary: Upload a file
   *     tags:
   *       - Shift Exception Evidences
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               shiftExceptionId:
   *                 type: number
   *                 description: Shift exception id
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
  @inject()
  async store({ request, response }: HttpContext) {
    const shiftExceptionEvidenceService = new ShiftExceptionEvidenceService()
    let inputs = request.all()
    inputs = shiftExceptionEvidenceService.sanitizeInput(inputs)
    const validationOptions = {
      types: ['image', 'document', 'text', 'application', 'archive'],
      size: '',
    }
    const file = request.file('file', validationOptions)
    // validate file required
    if (!file) {
      response.status(400)
      return {
        status: 400,
        type: 'warning',
        title: 'Missing data to process',
        message: 'Please upload a file valid',
        data: file,
      }
    }
    const disallowedExtensions = [
      'exe', 'js', 'py', 'dll',
    ]
    // Verificar si la extensión del archivo está en la lista de no permitidas
    if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
      response.status(400)
      return {
        status: 400,
        type: 'warning',
        title: 'Missing data to process',
        message: 'Please upload a file valid',
        data: file,
      }
    }
    const shiftExceptionId = inputs['shiftExceptionId']
    const shiftExceptionEvidence = {
      shiftExceptionEvidenceFile: '',
      shiftExceptionId: shiftExceptionId,
    } as ShiftExceptionEvidence
    // get file name and extensión
    const uploadService = new UploadService()
    const isValidInfo = await shiftExceptionEvidenceService.verifyInfoExist(shiftExceptionEvidence)
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
    try {
      const fileUrl = await uploadService.fileUpload(file, 'evidence-document', `shift-exception-evidences/${shiftExceptionId}`)
      shiftExceptionEvidence.shiftExceptionEvidenceFile = fileUrl
      shiftExceptionEvidence.shiftExceptionEvidenceType = file.type ? file.type : ''
      const newShiftExceptionEvidence = await shiftExceptionEvidenceService.create(shiftExceptionEvidence)
      response.status(201)
      return {
        type: 'success',
        title: 'Shift exception evidence',
        message: 'The shift exception evidence was created successfully',
        data: { shiftExceptionEvidence: newShiftExceptionEvidence },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

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
   * /api/shift-exception-evidences/{shiftExceptionEvidenceId}:
   *   put:
   *     summary: Update upload a file
   *     tags:
   *       - Shift Exception Evidences
   *     parameters:
   *       - in: path
   *         name: shiftExceptionEvidenceId
   *         schema:
   *           type: number
   *         description: Shift exception evidence id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               shiftExceptionId:
   *                 type: number
   *                 description: Shift exception id
   *                 required: true
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
  @inject()
  async update({ request, response }: HttpContext) {
    try {
      const shiftExceptionEvidenceService = new ShiftExceptionEvidenceService()
      let inputs = request.all()
      inputs = shiftExceptionEvidenceService.sanitizeInput(inputs)
      const validationOptions = {
        types: ['image', 'document', 'text', 'application', 'archive'],
        size: '',
      }
      const file = request.file('file', validationOptions)
      const shiftExceptionEvidenceId = request.param('shiftExceptionEvidenceId')
      if (!shiftExceptionEvidenceId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The shift exception evidence Id was not found',
          data: { shiftExceptionEvidenceId },
        }
      }
      const currentShiftExceptionEvidence = await ShiftExceptionEvidence.query()
        .whereNull('shift_exception_evidence_deleted_at')
        .where('shift_exception_evidence_id', shiftExceptionEvidenceId)
        .first()
      if (!currentShiftExceptionEvidence) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The shift exception evidence was not found',
          message: 'The shift exception evidence was not found with the entered ID',
          data: { shiftExceptionEvidenceId },
        }
      }
      const shiftExceptionId = inputs['shiftExceptionId']
      const shiftExceptionEvidence = {
        shiftExceptionEvidenceId: shiftExceptionEvidenceId,
        shiftExceptionId: shiftExceptionId
          ? shiftExceptionId
          : currentShiftExceptionEvidence.shiftExceptionId,
      } as ShiftExceptionEvidence
      const isValidInfo = await shiftExceptionEvidenceService.verifyInfoExist(shiftExceptionEvidence)
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
      if (file) {
        const disallowedExtensions = [
          'exe', 'js', 'py', 'dll',
        ]
        if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
          response.status(400)
          return {
            status: 400,
            type: 'warning',
            title: 'Missing data to process',
            message: 'Please upload a file valid',
            data: file,
          }
        }
        const uploadService = new UploadService()
        const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'shift-exception-evidences')
        if (currentShiftExceptionEvidence.shiftExceptionEvidenceFile) {
          const fileNameWithExt = decodeURIComponent(
            path.basename(currentShiftExceptionEvidence.shiftExceptionEvidenceFile)
          )
          const fileKey = `${Env.get('AWS_ROOT_PATH')}/shift-exception-evidences/${shiftExceptionId}/${fileNameWithExt}`
          await uploadService.deleteFile(fileKey)
        }
        shiftExceptionEvidence.shiftExceptionEvidenceFile = fileUrl
      }
      const updateShiftExceptionEvidence = await shiftExceptionEvidenceService.update(
        currentShiftExceptionEvidence,
        shiftExceptionEvidence
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Shift exception evidence',
        message: 'The shift exception evidence was updated successfully',
        data: { shiftExceptionEvidence: updateShiftExceptionEvidence },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

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
   * /api/shift-exception-evidences/{shiftExceptionEvidenceId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Shift Exception Evidences
   *     summary: delete shift exception evidence
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: shiftExceptionEvidenceId
   *         schema:
   *           type: number
   *         description: Shift exception evidence id
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
  async delete({ request, response }: HttpContext) {
    try {
      const shiftExceptionEvidenceId = request.param('shiftExceptionEvidenceId')
      if (!shiftExceptionEvidenceId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The shift exception evidence Id was not found',
          data: { shiftExceptionEvidenceId },
        }
      }
      const currentShiftExceptionEvidence = await ShiftExceptionEvidence.query()
        .whereNull('shift_exception_evidence_deleted_at')
        .where('shift_exception_evidence_id', shiftExceptionEvidenceId)
        .first()
      if (!currentShiftExceptionEvidence) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The shift exception evidence was not found',
          message: 'The shift exception evidence was not found with the entered ID',
          data: { shiftExceptionEvidenceId },
        }
      }
      const shiftExceptionEvidenceService = new ShiftExceptionEvidenceService()
      const deleteShiftExceptionEvidence = await shiftExceptionEvidenceService.delete(currentShiftExceptionEvidence)
      if (deleteShiftExceptionEvidence) {
        response.status(200)
        return {
          type: 'success',
          title: 'Shift exception evidence',
          message: 'The shift exception evidence was deleted successfully',
          data: { shiftExceptionEvidence: deleteShiftExceptionEvidence },
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
   * /api/shift-exception-evidences/{shiftExceptionEvidenceId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Shift Exception Evidences
   *     summary: get shift exception evidence by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: shiftExceptionEvidenceId
   *         schema:
   *           type: number
   *         description: Shift exception evidence id
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
  async show({ request, response }: HttpContext) {
    try {
      const shiftExceptionEvidenceId = request.param('shiftExceptionEvidenceId')
      if (!shiftExceptionEvidenceId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The shift exception evidence Id was not found',
          message: 'Missing data to process',
          data: { shiftExceptionEvidenceId },
        }
      }
      const shiftExceptionEvidenceService = new ShiftExceptionEvidenceService()
      const showShiftExceptionEvidence = await shiftExceptionEvidenceService.show(shiftExceptionEvidenceId)
      if (!showShiftExceptionEvidence) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The shift exception evidence was not found',
          message: 'The shift exception evidence was not found with the entered ID',
          data: { shiftExceptionEvidenceId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Shift exception evidence',
          message: 'The shift exception evidence was found successfully',
          data: { showShiftExceptionEvidence: showShiftExceptionEvidence },
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
