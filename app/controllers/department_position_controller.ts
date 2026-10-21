import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import DepartmentPosition from '#models/department_position'
import DepartmentPositionService, {
  type DepartmentPositionLinkCheck,
} from '#services/department_position_service'
import {
  createDepartmentPositionValidator,
  updateDepartmentPositionValidator,
} from '#validators/department_position'
import EmployeeService from '#services/employee_service'

export default class DepartmentPositionController {
  /**
   * @swagger
   * /api/departments-positions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments Positions
   *     summary: create new relation department-position
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               departmentId:
   *                 type: number
   *                 description: Department id
   *                 required: true
   *                 default: ''
   *               positionId:
   *                 type: number
   *                 description: Position id
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
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const departmentPosition = {
        departmentId: departmentId,
        positionId: positionId,
      } as DepartmentPosition
      const departmentPositionService = new DepartmentPositionService(i18n)
      const data = await request.validateUsing(createDepartmentPositionValidator)
      const exist = await departmentPositionService.verifyInfoExist(departmentPosition)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await departmentPositionService.verifyInfo(departmentPosition)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      departmentPosition.departmentId = data.departmentId
      departmentPosition.positionId = data.positionId
      const outcome = await db.transaction(async (trx) => {
        const check = await departmentPositionService.verifySingleDepartmentLink(
          { positionId: data.positionId, departmentId: data.departmentId },
          trx
        )
        if (!check.ok) return { ok: false as const, check }
        const created = await departmentPositionService.create(departmentPosition, {
          trx,
          businessUnitId: check.positionBusinessUnitId,
        })
        return { ok: true as const, created }
      })
      if (!outcome.ok) {
        const rejected = linkCheckResponse(outcome.check, t, {
          departmentId: data.departmentId,
          positionId: data.positionId,
        })
        response.status(rejected.status)
        return rejected.body
      }
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_created_successfully'),
        data: { departmentPosition: outcome.created },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/departments-positions/{departmentPositionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments Positions
   *     summary: update relation department-position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: departmentPositionId
   *         schema:
   *           type: number
   *         description: Department position id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               departmentId:
   *                 type: number
   *                 description: Department id
   *                 required: true
   *                 default: ''
   *               positionId:
   *                 type: number
   *                 description: Position id
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
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentPositionId = request.param('departmentPositionId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const departmentPosition = {
        departmentPositionId: departmentPositionId,
        departmentId: departmentId,
        positionId: positionId,
      } as DepartmentPosition
      if (!departmentPositionId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...departmentPosition },
        }
      }
      const currentDepartmentPosition = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .where('department_position_id', departmentPositionId)
        .first()
      if (!currentDepartmentPosition) {
        const entity = `${t('relation')} ${t('department')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...departmentPosition },
        }
      }
      const departmentPositionService = new DepartmentPositionService(i18n)
      const data = await request.validateUsing(updateDepartmentPositionValidator)
      const exist = await departmentPositionService.verifyInfoExist(departmentPosition)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await departmentPositionService.verifyInfo(departmentPosition)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      departmentPosition.departmentId = data.departmentId
      departmentPosition.positionId = data.positionId
      const previousPositionId =
        currentDepartmentPosition.positionId !== data.positionId
          ? currentDepartmentPosition.positionId
          : undefined
      const outcome = await db.transaction(async (trx) => {
        const check = await departmentPositionService.verifySingleDepartmentLink(
          {
            positionId: data.positionId,
            departmentId: data.departmentId,
            excludeDepartmentPositionId: currentDepartmentPosition.departmentPositionId,
            previousPositionId,
          },
          trx
        )
        if (!check.ok) return { ok: false as const, check }
        const updated = await departmentPositionService.update(
          currentDepartmentPosition,
          departmentPosition,
          { trx, businessUnitId: check.positionBusinessUnitId }
        )
        return { ok: true as const, updated }
      })
      if (!outcome.ok) {
        const rejected = linkCheckResponse(outcome.check, t, {
          departmentId: data.departmentId,
          positionId: data.positionId,
        })
        response.status(rejected.status)
        return rejected.body
      }
      response.status(201)
      return {
        type: 'success',
        title: t('resource'),
        message: t('resource_was_updated_successfully'),
        data: { departmentPosition: outcome.updated },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/departments-positions/{departmentPositionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments Positions
   *     summary: delete relation department position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: departmentPositionId
   *         schema:
   *           type: number
   *         description: Department position id
   *         required: true
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
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentPositionId = request.param('departmentPositionId')
      if (!departmentPositionId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { departmentPositionId },
        }
      }
      const currentDepartmentPosition = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .where('department_position_id', departmentPositionId)
        .first()
      if (!currentDepartmentPosition) {
        const entity = `${t('relation')} ${t('department')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { departmentPositionId },
        }
      }
      const departmentPositionService = new DepartmentPositionService(i18n)
      const deleteDepartmentPosition =
        await departmentPositionService.delete(currentDepartmentPosition)
      if (deleteDepartmentPosition) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { departmentPosition: deleteDepartmentPosition },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/departments-positions/{departmentId}/{positionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments Positions
   *     summary: delete relation department position by department and position id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: departmentId
   *         schema:
   *           type: number
   *         description: Department id
   *         required: true
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: position id
   *         required: true
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
  async deleteRelation({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentId = request.param('departmentId')
      const positionId = request.param('positionId')
      if (!departmentId || !positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { departmentId, positionId },
        }
      }

      const currentDepartmentPosition = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .where('department_id', departmentId)
        .where('position_id', positionId)
        .first()

      if (!currentDepartmentPosition) {
        const entity = `${t('relation')} ${t('department')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { departmentId, positionId },
        }
      }
      // validate if Employee belongs to the Position
      const employeeService = new EmployeeService(i18n)
      const hasEmployeesPosition = await employeeService.hasEmployeesPosition(positionId)
      if (hasEmployeesPosition) {
        response.status(400)
        return {
          type: 'warning',
          title: t('the_relation_department_position_has_employees'),
          message: t('the_relation_department_position_has_employees_assigned'),
          data: { departmentId, positionId },
        }
      }
      const departmentPositionService = new DepartmentPositionService(i18n)
      const deleteDepartmentPosition =
        await departmentPositionService.delete(currentDepartmentPosition)
      if (deleteDepartmentPosition) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { departmentPosition: deleteDepartmentPosition },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/departments-positions/{departmentPositionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments Positions
   *     summary: get relation department-position by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: departmentPositionId
   *         schema:
   *           type: number
   *         description: Department position id
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
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const departmentPositionId = request.param('departmentPositionId')
      if (!departmentPositionId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { departmentPositionId },
        }
      }
      const departmentPositionService = new DepartmentPositionService(i18n)
      const showDepartmentPosition = await departmentPositionService.show(departmentPositionId)
      if (!showDepartmentPosition) {
        const entity = `${t('relation')} ${t('department')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { departmentPositionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { departmentPosition: showDepartmentPosition },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}

type LinkTranslator = (
  key: string,
  params?: { [key: string]: string | number }
) => string

/** Cuerpo HTTP del rechazo de la pivote. Se responde fuera de la transacción. */
function linkCheckResponse(
  check: Exclude<DepartmentPositionLinkCheck, { ok: true }>,
  t: LinkTranslator,
  data: { departmentId: number; positionId: number }
) {
  if (check.reason === 'position-linked-to-other-department') {
    return {
      status: 422 as const,
      body: {
        type: 'warning' as const,
        title: t('department_position_linked_other_department_title'),
        message: check.linkedDepartmentName
          ? t('department_position_linked_other_department_message', {
              position: check.positionName,
              department: check.linkedDepartmentName,
            })
          : t('department_position_linked_other_department_message_generic', {
              position: check.positionName,
            }),
        detail: t('department_position_linked_other_department_detail'),
        key: 'puesto-ligado-a-otro-departamento',
        data,
      },
    }
  }

  if (check.reason === 'business-unit-mismatch') {
    return {
      status: 422 as const,
      body: {
        type: 'warning' as const,
        title: t('org_chart_scope_mismatch_title'),
        message: t('org_chart_move_position_business_unit_detail'),
        detail: t('org_chart_department_company_mismatch_detail'),
        key: 'alcance-organizacional',
        data,
      },
    }
  }

  const entity = t(check.reason === 'position-not-found' ? 'position' : 'department')
  return {
    status: 400 as const,
    body: {
      type: 'warning' as const,
      title: t('entity_was_not_found', { entity }),
      message: t('entity_was_not_found_with_entered_id', { entity }),
      data,
    },
  }
}
