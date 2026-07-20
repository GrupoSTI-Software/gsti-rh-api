import { HttpContext } from '@adonisjs/core/http'
import WorkDisabilityNote from '#models/work_disability_note'
import WorkDisabilityNoteService from '#services/work_disability_note_service'
import {
  createWorkDisabilityNoteValidator,
  updateWorkDisabilityNoteValidator,
} from '#validators/work_disability_note'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'

/** 404 uniforme (no revela "no existe" vs "no es tuyo") — USRH1784259058498. */
function workDisabilityNoteNotFoundResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: WORK_DISABILITY_ERROR_CODES.NOT_FOUND,
  })
}

export default class WorkDisabilityNoteController {
  /**
   * @swagger
   * /api/work-disability-notes:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Notes
   *     summary: create new work disability note
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityNoteDescription:
   *                 type: string
   *                 description: Work disability note description
   *                 required: true
   *                 default: ''
   *               workDisabilityId:
   *                 type: number
   *                 description: Work disability id
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
  async store({ request, response, auth }: HttpContext) {
    try {
      const userId = auth.user?.userId
      const workDisabilityNoteDescription = request.input('workDisabilityNoteDescription')
      const workDisabilityId = request.input('workDisabilityId')
      const workDisabilityNote = {
        workDisabilityNoteDescription: workDisabilityNoteDescription,
        workDisabilityId: workDisabilityId,
        userId: userId,
      } as WorkDisabilityNote
      const workDisabilityNoteService = new WorkDisabilityNoteService()
      const data = await request.validateUsing(createWorkDisabilityNoteValidator)
      const exist = await workDisabilityNoteService.verifyInfoExist(workDisabilityNote)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const newWorkDisabilityNote = await workDisabilityNoteService.create(workDisabilityNote)
      if (newWorkDisabilityNote) {
        response.status(201)
        return {
          type: 'success',
          title: 'Work disability notes',
          message: 'The work disability note was created successfully',
          data: { workDisabilityNote: newWorkDisabilityNote },
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
   * /api/work-disability-notes/{workDisabilityNoteId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Notes
   *     summary: get work disability note by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityNoteId
   *         schema:
   *           type: number
   *         description: Work disability note Id
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
      const workDisabilityNoteId = request.param('workDisabilityNoteId')
      if (!workDisabilityNoteId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The work disability note Id was not found',
          data: { workDisabilityNoteId },
        }
      }
      const workDisabilityNoteService = new WorkDisabilityNoteService()
      const showWorkDisabilityNote = await workDisabilityNoteService.show(workDisabilityNoteId)
      if (!showWorkDisabilityNote) {
        return workDisabilityNoteNotFoundResponse(response)
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability notes',
          message: 'The work disability note was found successfully',
          data: { workDisabilityNote: showWorkDisabilityNote },
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
   * /api/work-disability-notes/{workDisabilityNoteId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Notes
   *     summary: update work disability note by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityNoteId
   *         schema:
   *           type: number
   *         description: Work disability note id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               workDisabilityNoteDescription:
   *                 type: string
   *                 description: Work disability note description
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
      const workDisabilityNoteId = request.param('workDisabilityNoteId')
      if (!workDisabilityNoteId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability note Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityNoteId },
        }
      }
      const currentWorkDisabilityNote = await WorkDisabilityNote.query()
        .whereNull('work_disability_note_deleted_at')
        .where('work_disability_note_id', workDisabilityNoteId)
        .first()
      if (!currentWorkDisabilityNote) {
        return workDisabilityNoteNotFoundResponse(response)
      }
      const workDisabilityNoteDescription = request.input('workDisabilityNoteDescription')
      const workDisabilityNote = {
        workDisabilityNoteDescription: workDisabilityNoteDescription,
        workDisabilityNoteId: workDisabilityNoteId,
      } as WorkDisabilityNote
      const workDisabilityNoteService = new WorkDisabilityNoteService()
      await request.validateUsing(updateWorkDisabilityNoteValidator)
      const newWorkDisabilityNote = await workDisabilityNoteService.update(
        currentWorkDisabilityNote,
        workDisabilityNote
      )
      if (newWorkDisabilityNote) {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability notes',
          message: 'The work disability note was updated successfully',
          data: { workDisabilityNote: newWorkDisabilityNote },
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
   * /api/work-disability-notes/{workDisabilityNoteId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disability Notes
   *     summary: delete work disability note by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityNoteId
   *         schema:
   *           type: number
   *         description: Work disability note id
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
      const workDisabilityNoteId = request.param('workDisabilityNoteId')
      if (!workDisabilityNoteId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability note Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityNoteId },
        }
      }
      const currentWorkDisabilityNote = await WorkDisabilityNote.query()
        .whereNull('work_disability_note_deleted_at')
        .where('work_disability_note_id', workDisabilityNoteId)
        .first()
      if (!currentWorkDisabilityNote) {
        return workDisabilityNoteNotFoundResponse(response)
      }
      const workDisabilityNoteService = new WorkDisabilityNoteService()
      const deleteWorkDisabilityNote =
        await workDisabilityNoteService.delete(currentWorkDisabilityNote)
      if (deleteWorkDisabilityNote) {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disability notes',
          message: 'The work disability note was deleted successfully',
          data: { workDisabilityNote: deleteWorkDisabilityNote },
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
