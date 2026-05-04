import Position from '#models/position'
import DepartmentPosition from '#models/department_position'
import PositionService from '#services/position_service'
import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import axios from 'axios'
import BiometricPositionInterface from '../interfaces/biometric_position_interface.js'
import OrgChartMoveService from '#services/org_chart_move_service'
import {
  createPositionValidator,
  movePositionValidator,
  updatePositionValidator,
} from '#validators/position'
import { PositionShiftFilterInterface } from '../interfaces/position_shift_filter_interface.js'
import OrgAliasAppError from '#exceptions/org_alias_app_error'

export default class PositionController {
  /**
   * @swagger
   * /api/synchronization/positions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: sync information
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               page:
   *                 type: integer
   *                 description: The page number for pagination
   *                 required: false
   *                 default: 1
   *               limit:
   *                 type: integer
   *                 description: The number of records per page
   *                 required: false
   *                 default: 200
   *               positionCode:
   *                 type: string
   *                 description: The position code to filter by
   *                 required: false
   *                 default: ''
   *               positionName:
   *                 required: false
   *                 description: The position name to filter by
   *                 type: string
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

  async synchronization({ request, response, i18n }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 200)
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')

      let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/positions`
      apiUrl = `${apiUrl}?page=${page || ''}`
      apiUrl = `${apiUrl}&limit=${limit || ''}`
      apiUrl = `${apiUrl}&positionCode=${positionCode || ''}`
      apiUrl = `${apiUrl}&positionName=${positionName || ''}`
      const apiResponse = await axios.get(apiUrl)
      const data = apiResponse.data.data
      if (data) {
        const positionService = new PositionService(i18n)
        data.sort((a: BiometricPositionInterface, b: BiometricPositionInterface) => a.id - b.id)
        for await (const position of data) {
          await this.verify(position, positionService)
        }
        response.status(200)
        return {
          type: 'success',
          title: 'Sync positions',
          message: 'Positions have been synchronized successfully',
          data: {
            data,
          },
        }
      } else {
        response.status(404)
        return {
          type: 'warning',
          title: 'Sync positions',
          message: 'No data found to synchronize',
          data: { data },
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
   * /api/positions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: create new position
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionCode:
   *                 type: string
   *                 description: Position code
   *                 required: true
   *                 default: ''
   *               positionName:
   *                 type: string
   *                 description: Position name
   *                 required: true
   *                 default: ''
   *               positionAlias:
   *                 type: string
   *                 description: Position alias
   *                 required: false
   *                 default: ''
   *               positionDescription:
   *                 type: string
   *                 description: Position description
   *                 required: false
   *                 default: ''
   *               positionGeneralObjective:
   *                 type: string
   *                 description: Position general objective
   *                 required: false
   *                 default: ''
   *               positionSpecificRequirement:
   *                 type: string
   *                 description: Position specific requirement
   *                 required: false
   *                 default: ''
   *               positionEvaluationFrequency:
   *                 type: string
   *                 description: Position evaluation frequency
   *                 required: false
   *                 default: ''
   *               positionEvaluationDurationDays:
   *                 type: number
   *                 description: Position evaluation duration days
   *                 required: false
   *                 default: ''
   *               positionEvaluationStartDay:
   *                 type: integer
   *                 description: Position evaluation start day
   *                 required: false
   *                 default: ''
   *               positionIsDefault:
   *                 type: boolean
   *                 description: Position if is default
   *                 required: false
   *                 default: false
   *               positionActive:
   *                 type: boolean
   *                 description: Position status
   *                 required: false
   *                 default: false
   *               parentPositionId:
   *                 type: number
   *                 description: Position parent id
   *                 required: false
   *                 default: ''
   *               companyId:
   *                 type: number
   *                 description: Company id
   *                 required: true
   *                 default: ''
   *               positionProfileExpirationDate:
   *                 type: string
   *                 description: Position profile expiration date
   *                 required: false
   *                 default: ''
   *               positionMinStaff:
   *                 type: integer
   *                 description: Personal mínimo en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionIdealStaff:
   *                 type: integer
   *                 description: Personal ideal en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionMaxStaff:
   *                 type: integer
   *                 description: Personal máximo en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionMinActiveStaffPerShift:
   *                 type: integer
   *                 description: Personal mínimo activo por turno en el puesto (opcional, mayor que cero)
   *                 required: false
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
    try {
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')
      const positionAlias = request.input('positionAlias')
      const positionDescription = request.input('positionDescription')
      const positionGeneralObjective = request.input('positionGeneralObjective')
      const positionSpecificRequirement = request.input('positionSpecificRequirement')
      const positionEvaluationFrequency = request.input('positionEvaluationFrequency')
      const positionEvaluationDurationDays = request.input('positionEvaluationDurationDays')
      const positionEvaluationStartDay = request.input('positionEvaluationStartDay')
      const positionIsDefault = request.input('positionIsDefault')
      const positionActive = request.input('positionActive')
      const parentPositionId = request.input('parentPositionId')
      const positionProfileExpirationDate = request.input('positionProfileExpirationDate')
      const positionMinStaff = request.input('positionMinStaff')
      const positionIdealStaff = request.input('positionIdealStaff')
      const positionMaxStaff = request.input('positionMaxStaff')
      const positionMinActiveStaffPerShift = request.input('positionMinActiveStaffPerShift')
      const aliasesInput = request.input('aliases')

      const position = {
        positionCode: positionCode,
        positionName: positionName,
        positionAlias: positionAlias,
        aliases:
          aliasesInput === null || aliasesInput === undefined || aliasesInput === ''
            ? null
            : String(aliasesInput),
        positionDescription: positionDescription,
        positionGeneralObjective: positionGeneralObjective,
        positionSpecificRequirement: positionSpecificRequirement,
        positionEvaluationFrequency: positionEvaluationFrequency,
        positionEvaluationDurationDays: positionEvaluationDurationDays,
        positionEvaluationStartDay: positionEvaluationStartDay,
        positionIsDefault: positionIsDefault,
        positionActive: positionActive,
        parentPositionId: parentPositionId,
        positionProfileExpirationDate: positionProfileExpirationDate ? new Date(positionProfileExpirationDate) : null,
        positionMinStaff,
        positionIdealStaff,
        positionMaxStaff,
        positionMinActiveStaffPerShift,
      } as Position

      const positionService = new PositionService(i18n)
      const data = await request.validateUsing(createPositionValidator)
      const exist = await positionService.verifyInfoExist(position)

      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const newPosition = await positionService.create(position)

      if (newPosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was created successfully',
          data: { position: newPosition },
        }
      }
    } catch (error) {
      if (error instanceof OrgAliasAppError) {
        response.status(400)
        return {
          type: 'warning',
          title: error.title,
          message: error.detail,
          detail: error.detail,
          data: { key: error.key },
        }
      }
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
   * /api/positions/{positionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: update position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionCode:
   *                 type: string
   *                 description: Position code
   *                 required: true
   *                 default: ''
   *               positionName:
   *                 type: string
   *                 description: Position name
   *                 required: true
   *                 default: ''
   *               positionAlias:
   *                 type: string
   *                 description: Position alias
   *                 required: false
   *                 default: ''
   *               positionDescription:
   *                 type: string
   *                 description: Position description
   *                 required: false
   *                 default: ''
   *               positionGeneralObjective:
   *                 type: string
   *                 description: Position general objective
   *                 required: false
   *                 default: ''
   *               positionSpecificRequirement:
   *                 type: string
   *                 description: Position specific requirement
   *                 required: false
   *                 default: ''
   *               positionEvaluationFrequency:
   *                 type: string
   *                 description: Position evaluation frequency
   *                 required: false
   *                 default: ''
   *               positionEvaluationDurationDays:
   *                 type: number
   *                 description: Position evaluation duration days
   *                 required: false
   *                 default: ''
   *               positionEvaluationStartDay:
   *                 type: integer
   *                 description: Position evaluation start day
   *                 required: false
   *                 default: ''
   *               positionIsDefault:
   *                 type: boolean
   *                 description: Position if is default
   *                 required: false
   *                 default: false
   *               positionActive:
   *                 type: boolean
   *                 description: Position status
   *                 required: false
   *                 default: false
   *               parentPositionId:
   *                 type: number
   *                 description: Position parent id
   *                 required: false
   *                 default: ''
   *               companyId:
   *                 type: number
   *                 description: Company id
   *                 required: true
   *                 default: ''
   *               positionProfileExpirationDate:
   *                 type: string
   *                 description: Position profile expiration date
   *                 required: false
   *                 default: ''
   *               positionMinStaff:
   *                 type: integer
   *                 description: Personal mínimo en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionIdealStaff:
   *                 type: integer
   *                 description: Personal ideal en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionMaxStaff:
   *                 type: integer
   *                 description: Personal máximo en el puesto (opcional, mayor que cero)
   *                 required: false
   *               positionMinActiveStaffPerShift:
   *                 type: integer
   *                 description: Personal mínimo activo por turno en el puesto (opcional, mayor que cero)
   *                 required: false
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
      const positionId = request.param('positionId')
      const positionCode = request.input('positionCode')
      const positionName = request.input('positionName')
      const positionAlias = request.input('positionAlias')
      const positionDescription = request.input('positionDescription')
      const positionGeneralObjective = request.input('positionGeneralObjective')
      const positionSpecificRequirement = request.input('positionSpecificRequirement')
      const positionEvaluationFrequency = request.input('positionEvaluationFrequency')
      const positionEvaluationDurationDays = request.input('positionEvaluationDurationDays')
      const positionEvaluationStartDay = request.input('positionEvaluationStartDay')
      const positionIsDefault = request.input('positionIsDefault')
      const positionActive = request.input('positionActive')
      const parentPositionId = request.input('parentPositionId')
      const companyId = request.input('companyId')
      const positionProfileExpirationDate = request.input('positionProfileExpirationDate')
      const positionMinStaff = request.input('positionMinStaff')
      const positionIdealStaff = request.input('positionIdealStaff')
      const positionMaxStaff = request.input('positionMaxStaff')
      const positionMinActiveStaffPerShift = request.input('positionMinActiveStaffPerShift')

      const body = request.all() as Record<string, unknown>
      const position = {
        positionId: positionId,
        positionCode: positionCode,
        positionName: positionName,
        positionAlias: positionAlias,
        positionDescription: positionDescription,
        positionGeneralObjective: positionGeneralObjective,
        positionSpecificRequirement: positionSpecificRequirement,
        positionEvaluationFrequency: positionEvaluationFrequency,
        positionEvaluationDurationDays: positionEvaluationDurationDays,
        positionEvaluationStartDay: positionEvaluationStartDay,
        positionIsDefault: positionIsDefault,
        positionActive: positionActive,
        parentPositionId: parentPositionId,
        companyId: companyId,
        positionProfileExpirationDate: positionProfileExpirationDate ? new Date(positionProfileExpirationDate) : null,
        positionMinStaff,
        positionIdealStaff,
        positionMaxStaff,
        positionMinActiveStaffPerShift,
      } as Position
      if (Object.prototype.hasOwnProperty.call(body, 'aliases')) {
        const a = body.aliases
        position.aliases = a === null || a === '' ? null : String(a)
      }
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { ...position },
        }
      }
      const currentPosition = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', positionId)
        .first()
      if (!currentPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { ...position },
        }
      }
      const positionService = new PositionService(i18n)
      const data = await request.validateUsing(updatePositionValidator)

      const normalizeHierarchyId = (v: unknown): number | null => {
        if (v === null || v === undefined || v === '') {
          return null
        }
        const n = Number(v)
        if (Number.isNaN(n) || n < 1) {
          return null
        }
        return n
      }

      const pivotRow = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .where('position_id', positionId)
        .first()

      const parentFieldProvided = Object.prototype.hasOwnProperty.call(body, 'parentPositionId')
      const deptFieldProvided = Object.prototype.hasOwnProperty.call(body, 'departmentId')

      const resolvedNextParentId = parentFieldProvided
        ? normalizeHierarchyId(body.parentPositionId)
        : currentPosition.parentPositionId

      const pivotDeptId = pivotRow?.departmentId ?? null
      let targetDeptForRelocate: number | null = null

      if (deptFieldProvided && body.departmentId !== null && body.departmentId !== undefined && body.departmentId !== '') {
        targetDeptForRelocate = normalizeHierarchyId(body.departmentId)
      } else {
        targetDeptForRelocate = pivotDeptId
      }

      const parentDirty =
        parentFieldProvided &&
        (resolvedNextParentId ?? null) !== (currentPosition.parentPositionId ?? null)

      const deptDirty =
        deptFieldProvided &&
        body.departmentId !== null &&
        body.departmentId !== undefined &&
        body.departmentId !== '' &&
        normalizeHierarchyId(body.departmentId) !== pivotDeptId

      if (parentDirty || deptDirty) {
        if (targetDeptForRelocate === null || Number.isNaN(targetDeptForRelocate)) {
          response.status(422)
          return {
            type: 'warning',
            title: t('validation_error'),
            message:
              pivotDeptId === null && !deptFieldProvided
                ? 'Se requiere departmentId cuando el puesto no tiene vínculo en departamento-puesto para el organigrama'
                : 'Departamento destino inválido para reorganizar el puesto',
            ...(pivotDeptId === null ? { detail: t('org_chart_move_position_no_department_link_detail') } : {}),
            data: { ...data },
          }
        }

        const orgChartMoveService = new OrgChartMoveService(i18n)
        const relocateResult = await orgChartMoveService.relocatePosition(
          Number(positionId),
          resolvedNextParentId,
          targetDeptForRelocate
        )
        if (!relocateResult.ok) {
          const p = relocateResult.payload
          response.status(p.status)
          return {
            type: 'warning',
            title: t('validation_error'),
            message: p.message,
            ...(p.detail !== undefined ? { detail: p.detail } : {}),
            data: { ...data },
          }
        }

        await currentPosition.refresh()
        position.parentPositionId = currentPosition.parentPositionId
      }

      const exist = await positionService.verifyInfoExist(position)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await positionService.verifyInfo(position)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updatePosition = await positionService.update(currentPosition, position)
      if (updatePosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was updated successfully',
          data: { position: updatePosition },
        }
      }
    } catch (error) {
      if (error instanceof OrgAliasAppError) {
        response.status(400)
        return {
          type: 'warning',
          title: error.title,
          message: error.detail,
          detail: error.detail,
          data: { key: error.key },
        }
      }
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

  async move({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionIdRaw = request.param('positionId')
      const positionId =
        typeof positionIdRaw === 'string' ? Number.parseInt(positionIdRaw, 10) : positionIdRaw

      const moveService = new OrgChartMoveService(i18n)

      const user = auth.user!

      const canMove = await moveService.assertCanUpdateOrganizationChart(user.roleId)
      if (!canMove) {
        response.status(403)
        return {
          status: 403,
          message: t('org_chart_move_forbidden'),
        }
      }

      if (
        positionId === null ||
        positionId === undefined ||
        Number.isNaN(Number(positionId)) ||
        Number(positionId) < 1
      ) {
        response.status(400)
        return {
          status: 400,
          message: t('resource_id_was_not_found'),
        }
      }

      const { parentPositionId, departmentId } = await request.validateUsing(movePositionValidator)

      const result = await moveService.relocatePosition(Number(positionId), parentPositionId, departmentId)

      if (!result.ok) {
        const payload = result.payload
        response.status(payload.status)
        return {
          status: payload.status,
          message: payload.message,
          ...(payload.detail !== undefined ? { detail: payload.detail } : {}),
        }
      }

      response.status(200)
      return { data: { position: result.position } }
    } catch (error) {
      const err = error as { code?: string; messages?: Array<{ message: string }>; message?: string }
      if (err.code === 'E_VALIDATION_ERROR') {
        const msg = err.messages?.[0]?.message ?? t('validation_error')
        response.status(422)
        return {
          status: 422,
          message: msg,
          detail: msg,
        }
      }

      response.status(500)
      return {
        status: 500,
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        ...(err.message ? { detail: err.message } : {}),
      }
    }
  }

  /**
   * @swagger
   * /api/positions/{positionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: delete position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
  // async delete({ request, response }: HttpContext) {
  //   try {
  //     const positionId = request.param('positionId')
  //     if (!positionId) {
  //       response.status(400)
  //       return {
  //         type: 'warning',
  //         title: 'The position Id was not found',
  //         message: 'Missing data to process',
  //         data: { positionId },
  //       }
  //     }
  //     const currentPosition = await Position.query()
  //       .whereNull('position_deleted_at')
  //       .where('position_id', positionId)
  //       .first()
  //     if (!currentPosition) {
  //       response.status(404)
  //       return {
  //         type: 'warning',
  //         title: 'The position was not found',
  //         message: 'The position was not found with the entered ID',
  //         data: { positionId },
  //       }
  //     }
  //     const positionService = new PositionService()
  //     const deletePosition = await positionService.delete(currentPosition)
  //     if (deletePosition) {
  //       response.status(201)
  //       return {
  //         type: 'success',
  //         title: 'Positions',
  //         message: 'The position was deleted successfully',
  //         data: { position: deletePosition },
  //       }
  //     }
  //   } catch (error) {
  //     response.status(500)
  //     return {
  //       type: 'error',
  //       title: 'Server error',
  //       message: 'An unexpected error has occurred on the server',
  //       error: error.message,
  //     }
  //   }
  // }
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }
      // Buscar la posición actual
      const currentPosition = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', positionId)
        .first()
      if (!currentPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      }
      // Obtener empleados relacionados con la posición
      const employees = await currentPosition
        .related('employees')
        .query()
        .whereNull('employee_deleted_at')

      // Si hay empleados, asignarles la posición "Sin posición"
      if (employees.length > 0) {
        const defaultPosition = await Position.query()
          .whereNull('position_deleted_at')
          .where('position_name', 'Sin posición')
          .first()

        if (defaultPosition) {
          for (const employee of employees) {
            employee.positionId = defaultPosition.positionId
            await employee.save()
          }
        }
      }

      // Proceder con la eliminación
      const positionService = new PositionService(i18n)
      const deletePosition = await positionService.delete(currentPosition)
      if (deletePosition) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was deleted successfully',
          data: { position: deletePosition },
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
   * /api/positions/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get position by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }

      const positionService = new PositionService(i18n)
      const showPosition = await positionService.show(positionId)

      if (!showPosition) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The position was found successfully',
          data: { position: showPosition },
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
   * /api/positions/:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get positions
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
  async get({ request, response, i18n }: HttpContext) {
    try {
      const positionService = new PositionService(i18n)
      const search = request.input('q') ?? request.input('positionName') ?? request.input('search')
      const positions = await positionService.get(search)

      response.status(200)
      return {
        type: 'success',
        title: 'Positions',
        message: 'The position was found successfully',
        data: { positions },
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
   * /api/position/assign-shift/{positionId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: assign shift to employees by position
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
   *               shiftId:
   *                 type: number
   *                 description: Shift id
   *                 required: true
   *                 default: ''
   *               applySince:
   *                 type: string
   *                 format: date
   *                 description: Apply since (YYYY-MM-DD HH:mm:ss)
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
  async assignShift({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      const departmentId = request.input('departmentId')
      const shiftId = request.input('shiftId')
      const applySince = request.input('applySince')
      const positionShiftFilterInterface = {
        departmentId: departmentId,
        positionId: positionId,
        shiftId: shiftId,
        applySince: applySince,
      } as PositionShiftFilterInterface

      const positionService = new PositionService(i18n)
      const isValidInfo = await positionService.verifyInfoAssignShift(positionShiftFilterInterface)
      if (isValidInfo.status !== 200) {
        return {
          status: isValidInfo.status,
          type: isValidInfo.type,
          title: isValidInfo.title,
          message: isValidInfo.message,
          data: isValidInfo.data,
        }
      }
      const assignPosition = await positionService.assignShift(positionShiftFilterInterface)
      if (assignPosition.status === 201) {
        response.status(201)
        return {
          type: 'success',
          title: 'Positions',
          message: 'The shift was assign to position successfully',
          data: { position: assignPosition },
        }
      } else {
        return {
          status: assignPosition.status,
          type: assignPosition.type,
          title: assignPosition.title,
          message: assignPosition.message,
          data: {},
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

  private async verify(position: BiometricPositionInterface, positionService: PositionService) {
    const existPosition = await Position.query().where('position_sync_id', position.id).first()
    if (!existPosition) {
      await positionService.syncCreate(position)
    }
  }

  /**
   * @swagger
   * /api/positions/get-pdf/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get position pdf by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
  async getPdf({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }

      const positionService = new PositionService(i18n)
      const pdfBuffer = await positionService.getPdf(positionId)

      if (!pdfBuffer) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      }

      response.header('Content-Type', 'application/pdf')
      response.header('Content-Disposition', `attachment; filename="perfil-puesto-${positionId}.pdf"`)
      response.header('Content-Length', pdfBuffer.length.toString())
      response.status(200)
      return response.send(pdfBuffer)
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
   * /api/positions/get-excel/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Positions
   *     summary: get position excel by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
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
  async getExcel({ request, response, i18n }: HttpContext) {
    try {
      const positionId = request.param('positionId')
      if (!positionId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The position Id was not found',
          message: 'Missing data to process',
          data: { positionId },
        }
      }

      const positionService = new PositionService(i18n)
      const excelBuffer = await positionService.getExcel(positionId)

      if (!excelBuffer) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The position was not found',
          message: 'The position was not found with the entered ID',
          data: { positionId },
        }
      }

      response.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.header('Content-Disposition', `attachment; filename="perfil-puesto-${positionId}.xlsx"`)
      response.header('Content-Length', excelBuffer.length.toString())
      response.status(200)
      return response.send(excelBuffer)
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
