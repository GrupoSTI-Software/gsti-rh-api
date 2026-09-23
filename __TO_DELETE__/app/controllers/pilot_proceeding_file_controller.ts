import PilotProceedingFile from '#models/pilot_proceeding_file'
import PilotProceedingFileService from '#services/pilot_proceeding_file_service'
import {
  createPilotProceedingFileValidator,
  updatePilotProceedingFileValidator,
} from '#validators/pilot_proceeding_file'
import { HttpContext } from '@adonisjs/core/http'
import { PilotProceedingFileFilterInterface } from '../interfaces/pilot_proceeding_file_filter_interface.js'

export default class PilotProceedingFileController {
  /**
   * @swagger
   * /api/pilots-proceeding-files/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: get all relation pilot-proceedingfile
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
  async index({ response }: HttpContext) {
    try {
      const pilotProceedingFileService = new PilotProceedingFileService()
      const showPilotProceedingFiles = await pilotProceedingFileService.index()
      response.status(200)
      return {
        type: 'success',
        title: 'Pilots proceeding files',
        message: 'The relation pilot-proceedingfile were found successfully',
        data: { pilotProceedingFiles: showPilotProceedingFiles },
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
   * /api/pilots-proceeding-files:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: create new relation pilot-proceeding-files
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               pilotId:
   *                 type: number
   *                 description: Pilot id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: Proceeding file id
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
  async store({ request, response }: HttpContext) {
    try {
      const pilotId = request.input('pilotId')
      const proceedingFileId = request.input('proceedingFileId')
      const pilotProceedingFile = {
        pilotId: pilotId,
        proceedingFileId: proceedingFileId,
      } as PilotProceedingFile
      const pilotProceedingFileService = new PilotProceedingFileService()
      const data = await request.validateUsing(createPilotProceedingFileValidator)
      const exist = await pilotProceedingFileService.verifyInfoExist(pilotProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await pilotProceedingFileService.verifyInfo(pilotProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newPilotProceedingFile = await pilotProceedingFileService.create(pilotProceedingFile)
      if (newPilotProceedingFile) {
        response.status(201)
        return {
          type: 'success',
          title: 'Pilots proceeding files',
          message: 'The relation pilot-proceedingfile was created successfully',
          data: { pilotProceedingFile: newPilotProceedingFile },
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
   * /api/pilots-proceeding-files/{pilotProceedingFileId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: update relation pilot-proceedingfile
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotProceedingFileId
   *         schema:
   *           type: number
   *         description: Pilot proceeding file id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               pilotId:
   *                 type: number
   *                 description: Pilot id
   *                 required: true
   *                 default: ''
   *               proceedingFileId:
   *                 type: number
   *                 description: ProceedingFile id
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
  async update({ request, response }: HttpContext) {
    try {
      const pilotProceedingFileId = request.param('pilotProceedingFileId')
      const pilotId = request.input('pilotId')
      const proceedingFileId = request.input('proceedingFileId')
      const pilotProceedingFile = {
        pilotProceedingFileId: pilotProceedingFileId,
        pilotId: pilotId,
        proceedingFileId: proceedingFileId,
      } as PilotProceedingFile
      if (!pilotProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { ...pilotProceedingFile },
        }
      }
      const currentPilotProceedingFile = await PilotProceedingFile.query()
        .whereNull('pilot_proceeding_file_deleted_at')
        .where('pilot_proceeding_file_id', pilotProceedingFileId)
        .first()
      if (!currentPilotProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile was not found',
          message: 'The relation pilot-proceedingfile was not found with the entered ID',
          data: { ...pilotProceedingFile },
        }
      }
      const pilotProceedingFileService = new PilotProceedingFileService()
      const data = await request.validateUsing(updatePilotProceedingFileValidator)
      const exist = await pilotProceedingFileService.verifyInfoExist(pilotProceedingFile)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await pilotProceedingFileService.verifyInfo(pilotProceedingFile)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updatePilotProceedingFile = await pilotProceedingFileService.update(
        currentPilotProceedingFile,
        pilotProceedingFile
      )
      if (updatePilotProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'Pilot proceeding files',
          message: 'The relation pilot-proceedingfile was updated successfully',
          data: { pilotProceedingFile: updatePilotProceedingFile },
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
   * /api/pilots-proceeding-files/{pilotProceedingFileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: delete relation pilot proceeding files
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotProceedingFileId
   *         schema:
   *           type: number
   *         description: Pilot proceeding file id
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
      const pilotProceedingFileId = request.param('pilotProceedingFileId')
      if (!pilotProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { pilotProceedingFileId },
        }
      }
      const currentPilotProceedingFile = await PilotProceedingFile.query()
        .whereNull('pilot_proceeding_file_deleted_at')
        .where('pilot_proceeding_file_id', pilotProceedingFileId)
        .first()
      if (!currentPilotProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile was not found',
          message: 'The relation pilot-proceedingfile was not found with the entered ID',
          data: { pilotProceedingFileId },
        }
      }
      const pilotProceedingFileService = new PilotProceedingFileService()
      const deletePilotProceedingFile = await pilotProceedingFileService.delete(
        currentPilotProceedingFile
      )
      if (deletePilotProceedingFile) {
        response.status(200)
        return {
          type: 'success',
          title: 'Pilots proceeding files',
          message: 'The relation pilot-proceedingfile was deleted successfully',
          data: { pilotProceedingFile: deletePilotProceedingFile },
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
   * /api/pilots-proceeding-files/{pilotProceedingFileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: get relation pilot-proceedingfile by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: pilotProceedingFileId
   *         schema:
   *           type: number
   *         description: Pilot proceeding file id
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
      const pilotProceedingFileId = request.param('pilotProceedingFileId')
      if (!pilotProceedingFileId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile Id was not found',
          message: 'Missing data to process',
          data: { pilotProceedingFileId },
        }
      }
      const pilotProceedingFileService = new PilotProceedingFileService()
      const showPilotProceedingFile = await pilotProceedingFileService.show(pilotProceedingFileId)
      if (!showPilotProceedingFile) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The relation pilot-proceedingfile was not found',
          message: 'The relation pilot-proceedingfile was not found with the entered ID',
          data: { pilotProceedingFileId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Pilots proceeding files',
          message: 'The relation pilot-proceedingfile was found successfully',
          data: { pilotProceedingFile: showPilotProceedingFile },
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
   * /api/pilots-proceeding-files/get-expired-and-expiring:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Pilots Proceeding Files
   *     summary: get expired and expiring proceeding files by date
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: dateStart
   *         in: query
   *         required: false
   *         description: Date start (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
   *       - name: dateEnd
   *         in: query
   *         required: false
   *         description: Date end (YYYY-MM-DD)
   *         format: date
   *         schema:
   *           type: string
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
  async getExpiresAndExpiring({ request, response }: HttpContext) {
    try {
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = {
        dateStart: dateStart,
        dateEnd: dateEnd,
      } as PilotProceedingFileFilterInterface
      const pilotProceddingFileService = new PilotProceedingFileService()
      const pilotProceedingFiles = await pilotProceddingFileService.getExpiredAndExpiring(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Pilot proceeding files',
        message: 'The pilot proceeding files were found successfully',
        data: {
          pilotProceedingFiles: pilotProceedingFiles,
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
