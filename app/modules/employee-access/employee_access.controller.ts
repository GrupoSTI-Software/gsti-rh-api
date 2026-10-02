import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { resolveResponsibleUserId } from '#helpers/responsible_employee_scope'
import { EMPLOYEE_ACCESS_ERROR_CODES } from '#constants/employee_access_error_codes'
import EmployeeAccessService, { type AccessScope } from './employee_access.service.js'
import {
  addCanConsultValidator,
  addConsultedByValidator,
  directBossValidator,
  employeeAccessItemParamsValidator,
  employeeAccessParamsValidator,
} from './employee_access.validator.js'

/** Error con el triplete título/detalle/key del estándar. */
function fail(
  response: HttpContext['response'],
  status: number,
  title: string,
  detail: string,
  key: string,
  code: string,
  data?: Record<string, unknown>
) {
  return response.status(status).json({ type: 'error', title, detail, key, code, data })
}

function notFound(response: HttpContext['response']) {
  return fail(
    response,
    404,
    'No encontrado',
    'El colaborador o el acceso no existen en la empresa activa.',
    'recurso-no-encontrado',
    EMPLOYEE_ACCESS_ERROR_CODES.NOT_FOUND
  )
}

function employeeWithoutUser(response: HttpContext['response']) {
  return fail(
    response,
    422,
    'Colaborador sin usuario',
    'El colaborador no tiene usuario, así que no puede consultar a otras personas.',
    'colaborador-sin-usuario',
    EMPLOYEE_ACCESS_ERROR_CODES.EMPLOYEE_WITHOUT_USER
  )
}

/**
 * Acceso a la información de un colaborador desde su ficha: quién puede
 * consultarlo, a quién puede consultar su usuario y la jefatura directa.
 *
 * El permiso de cada ruta lo pone `permissionGate`; aquí se resuelve el
 * alcance: un colaborador o un acceso fuera de él responde 404.
 */
export default class EmployeeAccessController {
  private readonly service = new EmployeeAccessService()

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/consulted-by:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Usuarios que pueden consultar al colaborador, con nombre, puesto, departamento y jefatura
   */
  async consultedBy(ctx: HttpContext) {
    const { request, response } = ctx
    const { params } = await request.validateUsing(employeeAccessParamsValidator, {
      data: { params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(params.employeeId, scope)
    if (!employee) return notFound(response)
    return StandardResponseFormatter.success(
      response,
      await this.service.consultedBy(employee, scope),
      'Acceso a personal',
      'Quién puede consultar al colaborador',
      200,
      'consultedBy'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/can-consult:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Colaboradores que el usuario del colaborador puede consultar
   *     description: data.canConsult.hasUser indica si el colaborador tiene usuario
   */
  async canConsult(ctx: HttpContext) {
    const { request, response } = ctx
    const { params } = await request.validateUsing(employeeAccessParamsValidator, {
      data: { params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    return StandardResponseFormatter.success(
      response,
      { hasUser: employeeUser !== null, items: await this.service.canConsult(employeeUser, scope) },
      'Acceso a personal',
      'Personal que el colaborador puede consultar',
      200,
      'canConsult'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/consulted-by/candidates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Usuarios de la empresa que todavía no pueden consultar al colaborador
   */
  async userCandidates(ctx: HttpContext) {
    const { request, response } = ctx
    const { params } = await request.validateUsing(employeeAccessParamsValidator, {
      data: { params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    return StandardResponseFormatter.success(
      response,
      await this.service.userCandidates(employee, employeeUser, scope),
      'Acceso a personal',
      'Usuarios que se pueden agregar',
      200,
      'candidates'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/can-consult/candidates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Colaboradores activos que el usuario del colaborador todavía no consulta
   */
  async employeeCandidates(ctx: HttpContext) {
    const { request, response } = ctx
    const { params } = await request.validateUsing(employeeAccessParamsValidator, {
      data: { params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    return StandardResponseFormatter.success(
      response,
      await this.service.employeeCandidates(employee, employeeUser, scope),
      'Acceso a personal',
      'Personal que se puede agregar',
      200,
      'candidates'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/consulted-by:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Da acceso a varios usuarios para consultar al colaborador
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [userIds]
   *             properties:
   *               userIds: { type: array, items: { type: integer } }
   */
  async addConsultedBy(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(addConsultedByValidator, {
      data: { ...request.all(), params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(payload.params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    const created = await this.service.addConsultedBy(
      employee,
      employeeUser,
      payload.userIds,
      scope
    )
    return StandardResponseFormatter.success(
      response,
      { created },
      'Acceso otorgado',
      'Los usuarios ya pueden consultar al colaborador',
      201,
      'access'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/can-consult:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Agrega varios colaboradores que el usuario del colaborador podrá consultar
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [employeeIds]
   *             properties:
   *               employeeIds: { type: array, items: { type: integer } }
   */
  async addCanConsult(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(addCanConsultValidator, {
      data: { ...request.all(), params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(payload.params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    if (!employeeUser) return employeeWithoutUser(response)
    const created = await this.service.addCanConsult(
      employee,
      employeeUser,
      payload.employeeIds,
      scope
    )
    return StandardResponseFormatter.success(
      response,
      { created },
      'Personal agregado',
      'El colaborador ya puede consultar a estas personas',
      201,
      'access'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/{userResponsibleEmployeeId}/direct-boss:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Marca o desmarca la jefatura directa de un acceso
   *     description: Si el colaborador ya tiene otra jefatura directa responde 409 con su nombre; con replace=true la reemplaza.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [directBoss]
   *             properties:
   *               directBoss: { type: boolean }
   *               replace: { type: boolean }
   */
  async setDirectBoss(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(directBossValidator, {
      data: { ...request.all(), params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(payload.params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    const access = await this.service.findOwnedAccess(
      employee,
      employeeUser,
      payload.params.userResponsibleEmployeeId
    )
    if (!access) return notFound(response)

    const result = await this.service.setDirectBoss(
      access,
      payload.directBoss,
      payload.replace ?? false
    )
    if (result.status === 'taken') {
      return fail(
        response,
        409,
        'Ya tiene jefatura directa',
        `${result.employeeName} ya tiene como jefatura directa a ${result.currentBossName}.`,
        'jefatura-directa-ocupada',
        EMPLOYEE_ACCESS_ERROR_CODES.DIRECT_BOSS_TAKEN,
        {
          employeeName: result.employeeName,
          currentBossName: result.currentBossName,
          newBossName: result.newBossName,
        }
      )
    }
    return StandardResponseFormatter.success(
      response,
      { userResponsibleEmployeeId: access.userResponsibleEmployeeId },
      'Jefatura directa actualizada',
      'Se actualizó la jefatura directa',
      200,
      'access'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/access/{userResponsibleEmployeeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags: [Acceso a personal]
   *     summary: Quita un acceso de la ficha (en cualquiera de las dos direcciones)
   */
  async remove(ctx: HttpContext) {
    const { request, response } = ctx
    const { params } = await request.validateUsing(employeeAccessItemParamsValidator, {
      data: { params: request.params() },
    })
    const scope = await this.scopeOf(ctx)
    const employee = await this.service.findEmployee(params.employeeId, scope)
    if (!employee) return notFound(response)
    const employeeUser = await this.service.employeeUser(employee)
    const access = await this.service.findOwnedAccess(
      employee,
      employeeUser,
      params.userResponsibleEmployeeId
    )
    if (!access) return notFound(response)
    await this.service.remove(access)
    return StandardResponseFormatter.success(
      response,
      { userResponsibleEmployeeId: access.userResponsibleEmployeeId },
      'Acceso quitado',
      'Se quitó el acceso',
      200,
      'access'
    )
  }

  /** Empresas de la sesión y, si aplica, el candado de colaboradores a cargo. */
  private async scopeOf(ctx: HttpContext): Promise<AccessScope> {
    const user = ctx.auth.user
    if (user) await user.load('role')
    return {
      businessUnitIds: ctx.businessUnitScope ?? [],
      responsibleUserId: resolveResponsibleUserId(user),
    }
  }
}
