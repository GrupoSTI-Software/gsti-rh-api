import { HttpContext } from '@adonisjs/core/http'
import WorkDisabilityService from '#services/work_disability_service'
import WorkDisability from '#models/work_disability'
import { createWorkDisabilityValidator } from '#validators/work_disability'
import { cuid } from '@adonisjs/core/helpers'
import { WorkDisabilityFilterSearchInterface } from '../interfaces/work_disability_filter_search_interface.js'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'

/** 404 uniforme (no revela "no existe" vs "no es tuyo") — regla 4, USRH1784259058487. */
function workDisabilityNotFoundResponse(response: HttpContext['response']) {
  return response.status(404).json({
    title: 'Recurso no encontrado',
    detail: 'El recurso solicitado no existe o está fuera de tu alcance.',
    key: 'recurso-no-encontrado',
    code: WORK_DISABILITY_ERROR_CODES.NOT_FOUND,
  })
}

export default class WorkDisabilityController {
  /**
   * @swagger
   * /api/work-disabilities/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: get all work disabilities
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
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
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as WorkDisabilityFilterSearchInterface
      const workDisabilityService = new WorkDisabilityService()
      const workDisabilities = await workDisabilityService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Work disabilities',
        message: 'The work disabilities were found successfully',
        data: { workDisabilities: workDisabilities },
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
   * /api/work-disabilities:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: create new work disability
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               insuranceCoverageTypeId:
   *                 type: number
   *                 description: Insurance coverage type Id
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
      const employeeId = request.input('employeeId')
      const insuranceCoverageTypeId = request.input('insuranceCoverageTypeId')
      const workDisability = {
        workDisabilityUuid: cuid(),
        employeeId: employeeId,
        insuranceCoverageTypeId: insuranceCoverageTypeId,
      } as WorkDisability
      const workDisabilityService = new WorkDisabilityService()
      const data = await request.validateUsing(createWorkDisabilityValidator)
      const exist = await workDisabilityService.verifyInfoExist(workDisability)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await workDisabilityService.verifyInfo(workDisability)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newWorkDisability = await workDisabilityService.create(workDisability)
      if (newWorkDisability) {
        response.status(201)
        return {
          type: 'success',
          title: 'Work disabilities',
          message: 'The work disability was created successfully',
          data: { workDisability: newWorkDisability },
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
   * /api/work-disabilities/{workDisabilityId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: update work disability by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityId
   *         schema:
   *           type: number
   *         description: Work disability id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               insuranceCoverageTypeId:
   *                 type: number
   *                 description: Insurance coverage type Id
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
      const workDisabilityId = request.param('workDisabilityId')
      if (!workDisabilityId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityId },
        }
      }
      const currentWorkDisability = await WorkDisability.query()
        .whereNull('work_disability_deleted_at')
        .where('work_disability_id', workDisabilityId)
        .first()
      if (!currentWorkDisability) {
        return workDisabilityNotFoundResponse(response)
      }
      const employeeId = request.input('employeeId')
      const insuranceCoverageTypeId = request.input('insuranceCoverageTypeId')
      const workDisability = {
        employeeId: employeeId,
        workDisabilityId: workDisabilityId,
        insuranceCoverageTypeId: insuranceCoverageTypeId,
      } as WorkDisability
      const workDisabilityService = new WorkDisabilityService()
      const data = await request.validateUsing(createWorkDisabilityValidator)
      const exist = await workDisabilityService.verifyInfoExist(workDisability)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await workDisabilityService.verifyInfo(workDisability)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateWorkDisability = await workDisabilityService.update(
        currentWorkDisability,
        workDisability
      )
      if (updateWorkDisability) {
        await updateWorkDisability.load('workDisabilityPeriods')
        await updateWorkDisability.load('insuranceCoverageType')
        await workDisabilityService.updateShiftExceptions(updateWorkDisability)
        response.status(200)
        return {
          type: 'success',
          title: 'Work disabilities',
          message: 'The work disability was updated successfully',
          data: { workDisability: updateWorkDisability },
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
   * /api/work-disabilities/{workDisabilityId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: delete work disability
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityId
   *         schema:
   *           type: number
   *         description: Work disability id
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
      const workDisabilityId = request.param('workDisabilityId')
      if (!workDisabilityId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityId },
        }
      }
      const currentWorkDisability = await WorkDisability.query()
        .whereNull('work_disability_deleted_at')
        .where('work_disability_id', workDisabilityId)
        .first()
      if (!currentWorkDisability) {
        return workDisabilityNotFoundResponse(response)
      }
      const workDisabilityService = new WorkDisabilityService()
      await currentWorkDisability.load('workDisabilityPeriods')
      const deleteWorkDisability = await workDisabilityService.delete(currentWorkDisability)
      if (deleteWorkDisability) {
        await workDisabilityService.deleteShiftExceptions(currentWorkDisability)
        response.status(200)
        return {
          type: 'success',
          title: 'Work disabilities',
          message: 'The work disability was deleted successfully',
          data: { workDisability: deleteWorkDisability },
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
   * /api/work-disabilities/{workDisabilityId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: get work disability by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: workDisabilityId
   *         schema:
   *           type: number
   *         description: Work disability Id
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
      const workDisabilityId = request.param('workDisabilityId')
      if (!workDisabilityId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The work disability Id was not found',
          message: 'Missing data to process',
          data: { workDisabilityId },
        }
      }
      const workDisabilityService = new WorkDisabilityService()
      const showWorkDisability = await workDisabilityService.show(workDisabilityId)
      if (!showWorkDisability) {
        return workDisabilityNotFoundResponse(response)
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Work disabilities',
          message: 'The work disability was found successfully',
          data: { workDisability: showWorkDisability },
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
   * /api/work-disabilities/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Work Disabilities
   *     summary: get work disabilities by employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getByEmployee({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const filters = {
        employeeId: employeeId,
      } as WorkDisabilityFilterSearchInterface
      const workDisabilityService = new WorkDisabilityService()
      const workDisabilities = await workDisabilityService.getByEmployee(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Work disabilities',
        message: 'The work disabilities were found successfully',
        data: {
          workDisabilities: workDisabilities,
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
