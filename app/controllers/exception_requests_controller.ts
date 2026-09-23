/* eslint-disable prettier/prettier */
import { HttpContext } from '@adonisjs/core/http'
import ExceptionRequest from '../models/exception_request.js'
import ExceptionRequestAttachment from '#models/exception_request_attachment'
import { formatResponse } from '../helpers/responseFormatter.js'
import ExceptionRequestResolutionService from '#services/exception_request_resolution_service'
import ExceptionRequestDecisionContextService from '#services/exception_request_decision_context_service'
import ExceptionRequestAttachmentService from '#services/exception_request_attachment_service'
import ExceptionRequestCreationService from '#services/exception_request_creation_service'
import ExceptionRequestNotificationService from '#services/exception_request_notification_service'
import StoredFileStreamService from '#services/stored_file_stream_service'
import { resolveRequestBusinessUnitId } from '#helpers/resolve_request_business_unit_id'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import {
  storeExceptionRequestValidator,
  updateExceptionRequestValidator,
} from '#validators/exception_request'
import Employee from '#models/employee'
import { isTenantScopeActive, scopedEmployeeIds } from '#helpers/employee_tenant_scope'
import ExceptionType from '#models/exception_type'
import Ws from '#services/ws'
import Role from '#models/role'

/** Slug del rol de Recursos Humanos; ver `isRhManager`. */
const RH_MANAGER_ROLE_SLUG = 'rh-manager'
import {
  exceptionRequestAcceptTouchesVacation,
  exceptionRequestsBatchTouchesVacation,
} from '#helpers/shift_exception_touches_vacation'
import {
  ensureSecondaryPermission,
  evaluateSecondaryPermission,
} from '#helpers/permission_gate_secondary'
import {
  EMPLOYEES_MANAGE_VACATION_PERMISSION,
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
} from '#constants/employees_write_permission_declarations'
import { resolveSessionEmployee } from '#helpers/resolve_session_employee'
import {
  MAX_SELF_ATTACHMENTS,
  SELF_SERVICE_INITIAL_STATUS,
} from '#constants/exception_request_self_service'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { ensureEmployeeTabRead } from '#helpers/ensure_employee_tab_read'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

/** Slugs de roles de RRHH que ven solicitudes sin jefe directo con usuario */
const RRHH_ROLE_SLUGS = ['rh-manager', 'recursos-humanos'] as const

/**
 * Roles que ven todas las solicitudes de su empresa sin depender de ser jefe
 * directo de quien las levanta.
 *
 * El dueño de la cuenta entra aquí: es quien configura y opera el sistema en un
 * cliente que todavía no arma jerarquía, y sin esto no veía ninguna solicitud
 * —no es `root`, no está en los roles de RRHH y los empleados nuevos nacen sin
 * jefe directo asignado—, así que el módulo le quedaba vacío.
 *
 * "Todas" sigue significando las de su empresa: el corte por unidad de negocio
 * lo aplica `businessScope` y el filtro por empleados en alcance, no este rol.
 */
const FULL_VISIBILITY_ROLE_SLUGS = ['root', 'owner'] as const

/**
 * Tope de solicitudes por llamada al lote.
 *
 * Cada resolución da de alta una excepción de turno y puede consumir un periodo
 * de vacaciones: sin tope, una sola petición mantendría la conexión ocupada un
 * tiempo indefinido y se volvería un vector de carga trivial.
 */
const BATCH_RESOLVE_LIMIT = 100

export default class ExceptionRequestsController {
  /**
   * @swagger
   * tags:
   *   name: ExceptionRequests
   *   description: API for managing exception requests
   */
  /**
   * @swagger
   * /api/exception-requests/{id}/status:
   *   post:
   *     summary: Update the status of a specific exception request
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *       - name: status
   *         in: body
   *         required: true
   *         description: The new status of the exception request
   *         schema:
   *           type: object
   *           required:
   *             - status
   *           properties:
   *             status:
   *               type: string
   *               enum: [accepted, refused]
   *               example: accepted
   *     responses:
   *       200:
   *         description: Status updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: Status updated successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *       400:
   *         description: Invalid status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: Invalid status. Only "accepted" or "refused" are allowed.
   *       404:
   *         description: ExceptionRequest not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: ExceptionRequest not found
   *       409:
   *         description: The request was already resolved
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: ExceptionRequest already accepted. Only a pending request can be resolved.
   */
  async updateStatus(ctx: HttpContext) {
    const { request, params, response } = ctx
    const { status, description } = request.only(['status', 'description'])
    const exceptionRequestId = Number(params.id)

    if (await exceptionRequestAcceptTouchesVacation(exceptionRequestId, status)) {
      const allowed = await ensureSecondaryPermission(ctx, EMPLOYEES_MANAGE_VACATION_PERMISSION)
      if (!allowed) {
        return
      }
    }

    if (status !== 'accepted' && status !== 'refused') {
      return response.status(400).json({
        error: 'Invalid status. Only "accepted" or "refused" are allowed.',
      })
    }
    const exceptionRequest = await ExceptionRequest.query()
      .where('exception_request_id', params.id)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .first()
    if (!exceptionRequest) {
      return response.status(404).json({
        error: 'ExceptionRequest not found',
      })
    }

    // Una solicitud ya resuelta no se vuelve a resolver. Sin esta guarda, un
    // segundo `accepted`/`refused` reenvia la notificacion al empleado y, cuando
    // el tipo es vacaciones, vuelve a correr los efectos del alta. El endpoint
    // nunca lo validaba porque el backoffice solo abria el detalle de las
    // pendientes; desde que el detalle se consulta en cualquier estatus, la
    // puerta existe y se cierra aqui, no solo en la vista.
    if (exceptionRequest.exceptionRequestStatus !== 'pending') {
      return response.status(409).json({
        error: `ExceptionRequest already ${exceptionRequest.exceptionRequestStatus}. Only a pending request can be resolved.`,
      })
    }

    const resolutionNote = typeof description === 'string' ? description.trim() : ''

    const resolution = await new ExceptionRequestResolutionService().resolve({
      ctx,
      exceptionRequest,
      status,
      resolutionNote,
    })

    if (!resolution.ok) {
      return response.status(resolution.status).json(resolution.body)
    }

    return response.status(200).json({
      message: 'Status updated successfully',
      data: exceptionRequest,
    })
  }

  /**
   * @swagger
   * /api/exception-requests/resolve-batch:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     summary: Resolve several pending exception requests in one call
   *     tags: [ExceptionRequests]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               exceptionRequestIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               status:
   *                 type: string
   *                 enum: [accepted, refused]
   *               description:
   *                 type: string
   *                 description: Resolution note. Required when refusing.
   *     responses:
   *       200:
   *         description: Every request was resolved
   *       400:
   *         description: Invalid payload, missing note, or batch over the limit
   *       404:
   *         description: At least one id does not belong to the active company
   *       409:
   *         description: At least one request was already resolved
   *       500:
   *         description: Unexpected error
   */
  async resolveBatch(ctx: HttpContext) {
    const { request, response } = ctx
    const { exceptionRequestIds, status, description } = request.only([
      'exceptionRequestIds',
      'status',
      'description',
    ])

    if (status !== 'accepted' && status !== 'refused') {
      return response.status(400).json({
        error: 'Invalid status. Only "accepted" or "refused" are allowed.',
      })
    }

    const ids = Array.isArray(exceptionRequestIds)
      ? [...new Set(exceptionRequestIds.map((id) => Number(id)))].filter((id) =>
          Number.isInteger(id)
        )
      : []

    if (ids.length === 0) {
      return response.status(400).json({
        error: 'exceptionRequestIds must be a non-empty array of ids.',
      })
    }

    if (ids.length > BATCH_RESOLVE_LIMIT) {
      return response.status(400).json({
        error: `A batch cannot exceed ${BATCH_RESOLVE_LIMIT} exception requests.`,
      })
    }

    const resolutionNote = typeof description === 'string' ? description.trim() : ''

    // El rechazo exige motivo: es la respuesta que recibe el empleado y lo que
    // queda en su expediente. Se valida antes de tocar una sola fila.
    if (status === 'refused' && resolutionNote.length === 0) {
      return response.status(400).json({
        error: 'A resolution note is required when refusing exception requests.',
      })
    }

    if (await exceptionRequestsBatchTouchesVacation(ids, status)) {
      const allowed = await ensureSecondaryPermission(ctx, EMPLOYEES_MANAGE_VACATION_PERMISSION)
      if (!allowed) {
        return
      }
    }

    // Todas las solicitudes se traen bajo el alcance de la empresa activa: un id
    // ajeno simplemente no aparece, y la comparación de cantidades lo delata sin
    // revelar si existe en otra empresa.
    const exceptionRequests = await ExceptionRequest.query()
      .whereIn('exception_request_id', ids)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })

    if (exceptionRequests.length !== ids.length) {
      return response.status(404).json({
        error: 'At least one exception request was not found in the active company.',
      })
    }

    const alreadyResolved = exceptionRequests.filter(
      (exceptionRequest) => exceptionRequest.exceptionRequestStatus !== 'pending'
    )

    if (alreadyResolved.length > 0) {
      return response.status(409).json({
        error: 'At least one exception request was already resolved.',
        data: {
          exceptionRequestIds: alreadyResolved.map(
            (exceptionRequest) => exceptionRequest.exceptionRequestId
          ),
        },
      })
    }

    // Las validaciones anteriores cubren lo que puede fallar por el estado del
    // lote; de aquí en adelante solo falla el alta de una excepción concreta, y
    // entonces el proceso se detiene y la respuesta dice qué quedó aplicado.
    const resolutionService = new ExceptionRequestResolutionService()
    const notificationService = new ExceptionRequestNotificationService()
    const resolved: number[] = []
    const notificables: ExceptionRequest[] = []

    for (const exceptionRequest of exceptionRequests) {
      const resolution = await resolutionService.resolve({
        ctx,
        exceptionRequest,
        status,
        resolutionNote,
        // El aviso se manda al final, una vez, con todo lo que esta operación
        // resolvió: son varios días de una misma decisión, no varias
        // decisiones.
        notify: false,
      })

      if (!resolution.ok) {
        // Lo ya aplicado se avisa aunque el lote se haya detenido: esos días
        // quedaron resueltos y el colaborador tiene que saberlo.
        await notificationService.notifyResolution({
          exceptionRequests: notificables,
          status,
          resolutionNote,
        })

        return response.status(resolution.status).json({
          ...resolution.body,
          data: {
            ...(typeof resolution.body.data === 'object' ? resolution.body.data : {}),
            resolvedExceptionRequestIds: resolved,
            failedExceptionRequestId: exceptionRequest.exceptionRequestId,
          },
        })
      }

      resolved.push(exceptionRequest.exceptionRequestId)
      notificables.push(exceptionRequest)
    }

    await notificationService.notifyResolution({
      exceptionRequests: notificables,
      status,
      resolutionNote,
    })

    return response.status(200).json({
      message: 'Exception requests resolved successfully',
      data: { resolvedExceptionRequestIds: resolved },
    })
  }

  /**
   * @swagger
   * /api/exception-requests/{id}/decision-context:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Signals that support the resolution of an exception request
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Signals available for the request
   *       404:
   *         description: The request does not belong to the active company
   *       500:
   *         description: Unexpected error
   */
  async decisionContext(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    const exceptionRequest = await ExceptionRequest.query()
      .where('exception_request_id', params.id)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .first()

    if (!exceptionRequest) {
      return response.status(404).json({
        error: 'ExceptionRequest not found',
      })
    }

    // El contexto se pide al abrir el detalle, una solicitud a la vez: en el
    // listado serían tantas consultas como tarjetas visibles.
    const businessUnitId = await resolveRequestBusinessUnitId(ctx)
    const context = await new ExceptionRequestDecisionContextService(i18n).build(
      exceptionRequest,
      businessUnitId
    )

    return response.status(200).json({
      message: 'Decision context',
      data: context,
    })
  }

  /**
   * @swagger
   * /api/exception-requests/{id}/attachments:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: List the attachments of an exception request
   *     tags: [ExceptionRequests]
   *     responses:
   *       200:
   *         description: Attachments of the request
   *       404:
   *         description: The request does not belong to the active company
   *   post:
   *     security:
   *       - bearerAuth: []
   *     summary: Attach a supporting document to an exception request
   *     tags: [ExceptionRequests]
   *     responses:
   *       201:
   *         description: Attachment stored
   *       400:
   *         description: No file was sent or the active company could not be resolved
   *       404:
   *         description: The request does not belong to the active company
   *       422:
   *         description: The file was rejected by the intake profile
   */
  async indexAttachments(ctx: HttpContext) {
    const { params, response } = ctx
    const scope = await this.resolveAttachmentScope(
      ctx,
      Number(params.id),
      EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAllExceptionRequests
    )

    if (!scope.ok) return response.status(scope.status).json(scope.body)

    const attachments = await new ExceptionRequestAttachmentService().list(
      scope.exceptionRequest.exceptionRequestId,
      scope.businessUnitId,
      scope.ownAttachmentsOfUserId
    )

    return response.status(200).json({
      message: 'Exception request attachments',
      data: { attachments },
    })
  }

  async storeAttachment(ctx: HttpContext) {
    const { auth, request, params, response } = ctx
    const scope = await this.resolveAttachmentScope(
      ctx,
      Number(params.id),
      EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequestStatus
    )

    if (!scope.ok) return response.status(scope.status).json(scope.body)

    const file = request.file('file')

    if (!file) {
      return response.status(400).json({ error: 'A file is required.' })
    }

    const attachmentService = new ExceptionRequestAttachmentService()

    // Quien sube sobre su propia solicitud lo hace mientras siga pendiente y
    // dentro del tope. Ya resuelta, el comprobante dejaria de ser el respaldo de
    // lo que se pidio para volverse una correccion despues del fallo.
    if (scope.ownAttachmentsOfUserId !== undefined) {
      if (scope.exceptionRequest.exceptionRequestStatus !== 'pending') {
        return response.status(409).json({
          error: 'Only a pending request accepts attachments from the employee.',
        })
      }

      const propios = await attachmentService.countFor(
        scope.exceptionRequest.exceptionRequestId,
        scope.ownAttachmentsOfUserId
      )

      if (propios >= MAX_SELF_ATTACHMENTS) {
        return response.status(422).json({
          error: `A request accepts at most ${MAX_SELF_ATTACHMENTS} attachments from the employee.`,
        })
      }
    }

    try {
      const attachment = await attachmentService.upload({
        exceptionRequestIds: scope.attachToExceptionRequestIds,
        businessUnitId: scope.businessUnitId,
        file,
        uploadedByUserId: auth.user?.userId ?? null,
      })

      return response.status(201).json({
        message: 'Attachment stored successfully',
        data: { attachment },
      })
    } catch (error) {
      // El intake rechaza por contenido, no por extensión: un ejecutable
      // renombrado a .pdf muere aquí y el mensaje no revela por qué.
      return response.status(422).json({
        error: 'The file was rejected.',
        detail: (error as Error)?.message ?? 'unknown',
      })
    }
  }

  /**
   * @swagger
   * /api/exception-requests/{id}/attachments/{attachmentId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Download an attachment of an exception request
   *     tags: [ExceptionRequests]
   *     responses:
   *       200:
   *         description: The file stream
   *       404:
   *         description: The attachment does not belong to the request or the company
   */
  async showAttachment(ctx: HttpContext) {
    const { params, response } = ctx
    const scope = await this.resolveAttachmentScope(
      ctx,
      Number(params.id),
      EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAllExceptionRequests
    )

    if (!scope.ok) return response.status(scope.status).json(scope.body)

    const attachmentService = new ExceptionRequestAttachmentService()
    const attachment = await attachmentService.findInScope({
      attachmentId: Number(params.attachmentId),
      exceptionRequestId: scope.exceptionRequest.exceptionRequestId,
      businessUnitId: scope.businessUnitId,
      uploadedByUserId: scope.ownAttachmentsOfUserId,
    })

    if (!attachment) {
      return response.status(404).json({ error: 'Attachment not found' })
    }

    // La clave sale del registro, nunca del cliente: es lo que impide pedir un
    // objeto arbitrario del bucket escribiendo una ruta.
    const served = await new StoredFileStreamService().streamInto(
      ctx,
      attachment.attachmentStorageKey,
      { fallbackContentType: attachment.attachmentMime }
    )

    if (!served) {
      return response.status(404).json({ error: 'Attachment not found' })
    }
  }

  /**
   * Resuelve la solicitud, la empresa activa y con qué alcance se tocan sus
   * adjuntos.
   *
   * Hay dos maneras legítimas de llegar a un comprobante y la diferencia
   * importa. Quien tiene la facultad del módulo entra por el expediente y ve
   * todo lo que cuelga de la solicitud. Quien no la tiene solo puede entrar si
   * la solicitud es suya, y entonces ve únicamente lo que él mismo subió: el
   * comprobante que Recursos Humanos guardó —una constancia médica anexada al
   * expediente, por ejemplo— no es suyo para consultarlo desde la app.
   *
   * Sin empresa resuelta no se sirve ni se guarda nada: la marca de empresa es
   * lo que acota el archivo, así que un contexto sin ella es fail-closed.
   *
   * @param ctx - Contexto de la petición.
   * @param exceptionRequestId - Solicitud a la que se quiere llegar.
   * @param managePermission - Facultad que abre el expediente completo.
   */
  private async resolveAttachmentScope(
    ctx: HttpContext,
    exceptionRequestId: number,
    managePermission: PermissionGateOptions
  ): Promise<
    | {
        ok: true
        exceptionRequest: ExceptionRequest
        businessUnitId: number
        /**
         * Cuenta cuyos adjuntos son los únicos visibles. `undefined` cuando se
         * entra con la facultad del módulo y se ve todo.
         */
        ownAttachmentsOfUserId: number | undefined
        /**
         * Solicitudes a las que se cuelga un archivo nuevo. Es el lote completo
         * cuando el colaborador sube sobre su propia petición de varios días.
         */
        attachToExceptionRequestIds: number[]
      }
    | { ok: false; status: number; body: Record<string, unknown> }
  > {
    const exceptionRequest = await ExceptionRequest.query()
      .where('exception_request_id', exceptionRequestId)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .first()

    if (!exceptionRequest) {
      return { ok: false, status: 404, body: { error: 'ExceptionRequest not found' } }
    }

    const businessUnitId = await resolveRequestBusinessUnitId(ctx)

    if (!businessUnitId) {
      return {
        ok: false,
        status: 400,
        body: { error: 'The active company could not be resolved.' },
      }
    }

    if (await evaluateSecondaryPermission(ctx, managePermission)) {
      return {
        ok: true,
        exceptionRequest,
        businessUnitId,
        ownAttachmentsOfUserId: undefined,
        attachToExceptionRequestIds: [exceptionRequest.exceptionRequestId],
      }
    }

    const empleadoDeLaSesion = await resolveSessionEmployee(ctx.auth.user)

    // La solicitud ajena responde lo mismo que una inexistente: quien no tiene
    // la facultad del módulo tampoco tiene por qué averiguar qué permisos pidió
    // un compañero.
    if (!empleadoDeLaSesion || empleadoDeLaSesion.employeeId !== exceptionRequest.employeeId) {
      return { ok: false, status: 404, body: { error: 'ExceptionRequest not found' } }
    }

    return {
      ok: true,
      exceptionRequest,
      businessUnitId,
      ownAttachmentsOfUserId: ctx.auth.user?.userId,
      attachToExceptionRequestIds: await this.batchSiblingIds(exceptionRequest),
    }
  }

  /**
   * Comprobantes que subió una cuenta, por solicitud.
   *
   * Una sola consulta agregada para toda la página: pedirlos solicitud por
   * solicitud convertiría el listado del colaborador en una consulta por fila.
   *
   * @param exceptionRequestIds - Solicitudes de la página.
   * @param uploadedByUserId - Cuenta cuyos adjuntos se cuentan.
   */
  private async countOwnAttachments(
    exceptionRequestIds: number[],
    uploadedByUserId: number
  ): Promise<Map<number, number>> {
    const conteos = new Map<number, number>()

    if (exceptionRequestIds.length === 0) {
      return conteos
    }

    const filas = await ExceptionRequestAttachment.query()
      .whereIn('exception_request_id', exceptionRequestIds)
      .where('uploaded_by_user_id', uploadedByUserId)
      .whereNull('exception_request_attachment_deleted_at')
      .groupBy('exception_request_id')
      .select('exception_request_id')
      .count('* as total')

    for (const fila of filas) {
      conteos.set(fila.exceptionRequestId, Number(fila.$extras?.total ?? 0))
    }

    return conteos
  }

  /**
   * Solicitudes que nacieron con la que se está tocando.
   *
   * Un permiso de varios días son varias filas y el comprobante las respalda a
   * todas; colgarlo de una sola lo haría desaparecer justo cuando la empresa
   * resuelve los otros días por separado. Sin lote —las solicitudes anteriores
   * a la columna— es ella sola.
   */
  private async batchSiblingIds(exceptionRequest: ExceptionRequest): Promise<number[]> {
    if (!exceptionRequest.exceptionRequestBatchId) {
      return [exceptionRequest.exceptionRequestId]
    }

    const hermanas = await ExceptionRequest.query()
      .where('exception_request_batch_id', exceptionRequest.exceptionRequestBatchId)
      .where('employee_id', exceptionRequest.employeeId)
      .select('exception_request_id')

    const ids = hermanas.map((solicitud) => solicitud.exceptionRequestId)

    return ids.length > 0 ? ids : [exceptionRequest.exceptionRequestId]
  }
  /**
   * @swagger
   * /api/exception-requests:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get a list of exception requests
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: page
   *         in: query
   *         required: false
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Filter by employee ID
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: A list of exception requests
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
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: integer
   *                         per_page:
   *                           type: integer
   *                         current_page:
   *                           type: integer
   *                         last_page:
   *                           type: integer
   *                         first_page:
   *                           type: integer
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           employeeId:
   *                             type: integer
   *                           exceptionTypeId:
   *                             type: integer
   *                           exceptionRequestStatus:
   *                             type: string
   *                           exceptionRequestDescription:
   *                             type: string
   *       400:
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       500:
   *         description: Unexpected error
   */

  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const employeeId = request.input('employeeId')

      const query = ExceptionRequest.query()
        .if(isTenantScopeActive(), (scoped) => {
          scoped.whereIn('employee_id', scopedEmployeeIds())
        })
        .preload('employee', (employeeQuery) => {
          employeeQuery.preload('department')
          employeeQuery.preload('position')
        })
        .preload('exceptionType')
        .preload('user')

      if (employeeId) {
        query.where('employeeId', employeeId)
      }

      const exceptionRequests = await query
        .orderBy('exception_request_id', 'desc')
        .paginate(page, limit)

      response.status(200)
      return formatResponse(
        'success',
        'Exception Requests',
        'The exception requests were found successfully',
        exceptionRequests.all(),
        {
          total: exceptionRequests.total,
          per_page: exceptionRequests.perPage,
          current_page: exceptionRequests.currentPage,
          last_page: exceptionRequests.lastPage,
          first_page: 1,
        }
      )
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
  /**
   * @swagger
   * /api/exception-requests:
   *   post:
   *     summary: Create a new exception request
   *     tags: [ExceptionRequests]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: integer
   *               exceptionTypeId:
   *                 type: integer
   *               exceptionRequestStatus:
   *                 type: string
   *                 enum: [requested, pending, accepted, refused]
   *               exceptionRequestDescription:
   *                 type: string
   *                 maxLength: 255
   *               requestedDate:
   *                 type: string
   *                 example: "2024-11-15 14:00:00"
   *               exceptionRequestCheckInTime:
   *                 type: string
   *                 example: "14:00:00"
   *               exceptionRequestCheckOutTime:
   *                 type: string
   *                 example: "14:00:00"
   *               daysToApply:
   *                 type: number
   *                 example: 0
   *     responses:
   *       201:
   *         description: Exception request created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   */

  async store(ctx: HttpContext) {
    const { auth, request, response } = ctx
    const user = auth.user
    if (!user) {
      response.status(404)
      return {
        type: 'warning',
        title: 'User',
        message: 'User not found',
        data: { user: {} },
      }
    }
    const data = await request.validateUsing(storeExceptionRequestValidator)

    /**
     * El alta es la única entrada del módulo exenta de `permissionGate` (D-08)
     * porque la comparten dos usos que no se parecen en nada: Recursos Humanos
     * registrando el permiso de un tercero desde el backoffice, y el propio
     * colaborador pidiendo el suyo desde la app.
     *
     * La facultad de gestionar solicitudes es lo que separa a uno del otro. Sin
     * ella, el cuerpo de la petición deja de mandar: ni el empleado ni el
     * estatus se leen de ahí. Antes sí se leían, y con un token cualquiera se
     * podía levantar una solicitud a nombre de otra persona —de otra empresa,
     * incluso— y nacerla `accepted`, que es autorizarse el permiso uno mismo.
     */
    const puedeGestionarTerceros = await evaluateSecondaryPermission(
      ctx,
      EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequest
    )

    const empleadoDeLaSesion = puedeGestionarTerceros ? null : await resolveSessionEmployee(user)

    if (!puedeGestionarTerceros && !empleadoDeLaSesion) {
      return response.status(403).json({
        type: 'error',
        title: 'Forbidden',
        message: 'You do not have an associated employee record',
      })
    }

    const employeeId = empleadoDeLaSesion?.employeeId ?? data.employeeId

    // Quien registra a nombre de un tercero tiene que decir de quién se trata.
    // En el autoservicio el dato no viaja porque el servidor ya lo sabe, y la
    // guarda anterior ya garantizó que la sesión tiene expediente.
    if (!employeeId) {
      return response.status(400).json({
        error: 'employeeId is required when registering on behalf of an employee.',
      })
    }

    const exceptionRequestStatus = puedeGestionarTerceros
      ? (data.exceptionRequestStatus ?? SELF_SERVICE_INITIAL_STATUS)
      : SELF_SERVICE_INITIAL_STATUS

    const employee = await Employee.query()
      .where('employeeId', employeeId)
      .whereNull('deletedAt')
      // El alcance de empresa se aplica también a quien sí puede registrar a
      // nombre de terceros: la facultad es sobre su empresa, no sobre la tabla.
      // Sin esto, un `employeeId` de otra empresa se daba de alta sin más.
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .first()
    if (!employee) {
      return response.status(404).json({
        error: 'Employee not found or has been deleted',
      })
    }

    const exceptionType = await ExceptionType.query()
      .where('exceptionTypeId', data.exceptionTypeId)
      .whereNull('deletedAt')
      .first()

    if (!exceptionType) {
      return response.status(404).json({
        error: 'Exception type not found or has been deleted',
      })
    }

    // Qué puede pedir un colaborador lo decide el catálogo de la empresa, no la
    // app: un tipo reservado para captura interna no se solicita desde el
    // teléfono aunque su id se conozca.
    if (
      !puedeGestionarTerceros &&
      (!exceptionType.exceptionTypeCanEmployeeRequests || exceptionType.exceptionTypeActive !== 1)
    ) {
      return response.status(403).json({
        type: 'error',
        title: 'Forbidden',
        message: 'This exception type cannot be requested by the employee',
      })
    }

    const creacion = await new ExceptionRequestCreationService().create({
      employeeId: employee.employeeId,
      exceptionTypeId: exceptionType.exceptionTypeId,
      exceptionRequestStatus,
      exceptionRequestDescription: data.exceptionRequestDescription,
      exceptionRequestCheckInTime: data.exceptionRequestCheckInTime,
      exceptionRequestCheckOutTime: data.exceptionRequestCheckOutTime,
      exceptionRequestPeriodInHours: data.exceptionRequestPeriodInHours ?? 0,
      requestedDate: data.requestedDate,
      daysToApply: data.daysToApply ?? 1,
      userId: user.userId,
      // El rol se lee de la sesión, no del cuerpo: es la marca que alimenta los
      // contadores de no leídas del backoffice y nadie se la asigna a sí mismo.
      createdByHr: puedeGestionarTerceros ? await this.isRhManager(user.roleId) : false,
    })

    let comprobante: Record<string, unknown> | null = null

    if (creacion.saved.length > 0) {
      comprobante = await this.storeRequestedFile(ctx, creacion.saved)

      if (Ws.io) {
        Ws.io.emit('new-exception-request', {})
      }

      // Solo se avisa de lo que hay que resolver. Un permiso registrado ya
      // autorizado desde el backoffice no le pide nada a nadie.
      if (exceptionRequestStatus === 'pending') {
        await new ExceptionRequestNotificationService().notifyBatchCreated(creacion.batchId)
      }
    }

    const dataInfo = {
      data: {
        batchId: creacion.batchId,
        exceptionRequestsSaved: creacion.saved,
        exceptionRequestsError: creacion.errors,
        attachment: comprobante,
      },
    }
    return response
      .status(201)
      .json(formatResponse('success', 'Successfully created', 'Resource created', dataInfo))
  }

  /**
   * Guarda el comprobante que venga en el mismo alta, si viene.
   *
   * Llega en la misma petición a propósito. El aviso al aprobador dice si la
   * solicitud trae respaldo, y eso solo puede ser cierto si el archivo ya está
   * cuando el correo sale; en dos viajes el correo se manda siempre antes que
   * el archivo. Cuelga de todos los días del lote: la constancia es una y
   * justifica cada uno.
   *
   * Un archivo rechazado por el intake no tumba el alta —la solicitud ya está
   * registrada y el comprobante se puede subir después—, pero sí se reporta.
   */
  private async storeRequestedFile(
    ctx: HttpContext,
    saved: ExceptionRequest[]
  ): Promise<Record<string, unknown> | null> {
    const { auth, request } = ctx
    const file = request.file('file')

    if (!file) {
      return null
    }

    const businessUnitId = await resolveRequestBusinessUnitId(ctx)

    if (!businessUnitId) {
      return { error: 'The active company could not be resolved.' }
    }

    try {
      return { ...(await new ExceptionRequestAttachmentService().upload({
        exceptionRequestIds: saved.map((solicitud) => solicitud.exceptionRequestId),
        businessUnitId,
        file,
        uploadedByUserId: auth.user?.userId ?? null,
      })) }
    } catch (error) {
      return {
        error: 'The file was rejected.',
        detail: (error as Error)?.message ?? 'unknown',
      }
    }
  }

  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   get:
   *     summary: Get a specific exception request by ID
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Exception request found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   *       404:
   *         description: Exception request not found
   */
  async show(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      const exceptionRequest = await ExceptionRequest.query()
        .where('exception_request_id', params.id)
        .if(isTenantScopeActive(), (scoped) => {
          scoped.whereIn('employee_id', scopedEmployeeIds())
        })
        .first()
      const allowed = exceptionRequest
        ? await ensureEmployeeTabRead(
            ctx,
            exceptionRequest.employeeId,
            EMPLOYEES_READ_PERMISSION_DECLARATIONS.showExceptionRequest
          )
        : await ensureSecondaryPermission(
            ctx,
            EMPLOYEES_READ_PERMISSION_DECLARATIONS.showExceptionRequest
          )
      if (!allowed) {
        return
      }
      if (!exceptionRequest) {
        return response
          .status(404)
          .json(formatResponse('error', 'Not Found', 'Resource not found', 'NO DATA'))
      }
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            'Successfully fetched',
            'Resource fetched',
            exceptionRequest.toJSON()
          )
        )
    } catch {
      return response
        .status(404)
        .json(formatResponse('error', 'Not Found', 'Resource not found', 'NO DATA'))
    }
  }

  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   put:
   *     summary: Update an existing exception request
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               exceptionRequestStatus:
   *                 type: string
   *                 enum: [requested, pending, accepted, refused]
   *               exceptionRequestDescription:
   *                 type: string
   *                 maxLength: 255
   *               requestedDate:
   *                 type: string
   *                 example: "2024-11-15 14:00:00"
   *     responses:
   *       200:
   *         description: Exception request updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     employeeId:
   *                       type: integer
   *                     exceptionTypeId:
   *                       type: integer
   *                     exceptionRequestStatus:
   *                       type: string
   *                     exceptionRequestDescription:
   *                       type: string
   *       404:
   *         description: Exception request not found
   */

  /**
   * Distingue una solicitud capturada por Recursos Humanos de una capturada
   * por gerencia. Se resuelve por SLUG y no por `role_id`: el id es
   * autoincremental y su valor depende del orden de siembra de cada
   * instalación, así que comparar contra el literal 2 acertaba solo mientras
   * los seeders fijaran los ids a mano.
   */
  private async isRhManager(roleId: number | undefined): Promise<boolean> {
    if (!roleId) {
      return false
    }
    const role = await Role.find(roleId)
    return role?.roleSlug === RH_MANAGER_ROLE_SLUG
  }

  async update({ params, request, response }: HttpContext) {
    const data = await request.validateUsing(updateExceptionRequestValidator)
    const exceptionRequest = await ExceptionRequest.query()
      .where('exception_request_id', params.id)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .firstOrFail()
    const esRecursosHumanos = await this.isRhManager(data.role?.roleId)
    const requestedDate = data.requestedDate.toISODate()
    if (requestedDate) {
      const exceptionRequestData = {
        exceptionRequestStatus: data.exceptionRequestStatus,
        exceptionRequestDescription: data.exceptionRequestDescription,
        exceptionRequestCheckInTime: data.exceptionRequestCheckInTime,
        exceptionRequestCheckOutTime: data.exceptionRequestCheckOutTime,
        requestedDate: requestedDate,
        exceptionRequestRhRead: esRecursosHumanos ? 1 : 0,
        exceptionRequestGerencialRead: esRecursosHumanos ? 0 : 1,
      }
      delete data.role
      exceptionRequest.merge(exceptionRequestData)
      await exceptionRequest.save()
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            'Successfully updated',
            'Resource updated',
            exceptionRequest.toJSON()
          )
        )
    } else {
      return response.status(404).json({
        error: 'Exception request date is not valid',
      })
    }
  }
  /**
   * @swagger
   * /api/exception-requests/{id}:
   *   delete:
   *     summary: Delete an exception request by ID
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         description: ID of the exception request
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Exception request deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Successfully deleted
   *                 data:
   *                   type: string
   *                   example: DELETED
   *       404:
   *         description: Exception request not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: error
   *                 message:
   *                   type: string
   *                   example: Exception request not found
   */

  async destroy({ params, response }: HttpContext) {
    const exceptionRequest = await ExceptionRequest.query()
      .where('exception_request_id', params.id)
      .if(isTenantScopeActive(), (scoped) => {
        scoped.whereIn('employee_id', scopedEmployeeIds())
      })
      .firstOrFail()
    await exceptionRequest.delete()

    return response
      .status(200)
      .json(formatResponse('success', 'Successfully deleted', 'Resource deleted', 'DELETED'))
  }

  /**
   * @swagger
   * /api/exception-requests/all:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Retrieve all exception requests with filters and pagination
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: page
   *         in: query
   *         required: false
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: departmentId
   *         in: query
   *         description: Filter by department ID
   *         required: false
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         description: Filter by position ID
   *         required: false
   *         schema:
   *           type: integer
   *       - name: status
   *         in: query
   *         description: Filter by exception request status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [requested, pending, accepted, refused, all]
   *       - name: employeeName
   *         in: query
   *         description: Filter by employee ID
   *         required: false
   *         schema:
   *           type: integer
   *       - name: sortOrder
   *         in: query
   *         description: Sort order (asc or desc)
   *         required: false
   *         schema:
   *           type: string
   *           enum: [asc, desc, ascend, descend]
   *           default: desc
   *     responses:
   *       200:
   *         description: List of exception requests retrieved successfully
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
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: integer
   *                         per_page:
   *                           type: integer
   *                         current_page:
   *                           type: integer
   *                         last_page:
   *                           type: integer
   *                         first_page:
   *                           type: integer
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           exceptionRequestId:
   *                             type: integer
   *                           employeeId:
   *                             type: integer
   *                           exceptionRequestStatus:
   *                             type: string
   *                           exceptionRequestDescription:
   *                             type: string
   *                           requestedDate:
   *                             type: string
   *                             example: "2024-11-15 14:00:00"
   *       400:
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       404:
   *         description: No exception requests found
   *       500:
   *         description: Unexpected error
   */

  async indexAllExceptionRequests({ auth, request, response }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        return response.status(401).json({
          type: 'error',
          title: 'Unauthorized',
          message: 'Usuario no autenticado',
        })
      }
      await user.preload('role')
      const roleSlug = user.role.roleSlug

      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const sortOrder = request.input('sortOrder', 'desc') || 'descend'
      let departmentId = request.input('departmentId')
      let positionId = request.input('positionId')
      let status = request.input('status')
      let employeeName = request.input('employeeName')
      const branchOfficeId = request.input('branchOfficeId')
      const exceptionTypeId = request.input('exceptionTypeId')
      const dateFrom = request.input('dateFrom')
      const dateTo = request.input('dateTo')

      if (departmentId === '9999') {
        departmentId = null
      }
      if (positionId === '9999') {
        positionId = null
      }
      if (status === 'all') {
        status = null
      }

      // Visibilidad: root y el dueño de la cuenta ven todas las de su empresa;
      // RRHH ve solo solicitudes sin jefe directo con usuario; resto solo las de
      // sus subordinados directos
      const hasFullVisibility = FULL_VISIBILITY_ROLE_SLUGS.includes(
        roleSlug as (typeof FULL_VISIBILITY_ROLE_SLUGS)[number]
      )
      const isRHH = RRHH_ROLE_SLUGS.includes(roleSlug as (typeof RRHH_ROLE_SLUGS)[number])

      /**
       * Criterios que comparten el listado y los conteos de las tabs. Viven en un
       * solo lugar para que un conteo nunca describa un universo distinto al de
       * la pagina que el usuario esta viendo.
       */
      const aplicarFiltrosComunes = (target: ModelQueryBuilderContract<typeof ExceptionRequest>) =>
        target
          .if(isTenantScopeActive(), (scoped) => {
            scoped.whereIn('employee_id', scopedEmployeeIds())
          })
          .if(departmentId, (q) => {
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.where('departmentId', departmentId)
            })
          })
          .if(positionId, (q) => {
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.where('positionId', positionId)
            })
          })
          .if(branchOfficeId, (q) => {
            // La sucursal vigente del empleado: `employee_branch_office` con la
            // fila activa. El scope de empresa ya acoto los empleados, asi que
            // una sucursal de otra empresa simplemente no empareja con ninguno.
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.whereHas('activeEmployeeBranchOffice', (branchQuery) => {
                branchQuery.where('branchOfficeId', branchOfficeId)
              })
            })
          })
          .if(exceptionTypeId, (q) => q.where('exceptionTypeId', exceptionTypeId))
          .if(dateFrom, (q) => q.where('requestedDate', '>=', dateFrom))
          .if(dateTo, (q) => q.where('requestedDate', '<=', dateTo))
          .if(employeeName, (q) => {
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.where('employeeId', employeeName)
            })
          })
          .if(!hasFullVisibility, (q) => {
            if (isRHH) {
              // RRHH: solo solicitudes cuyo empleado NO tiene jefe directo con usuario vigente
              q.whereHas('employee', (employeeQuery) => {
                employeeQuery.whereDoesntHave('userResponsibleEmployee', (ureQ) => {
                  ureQ.where('userResponsibleEmployeeDirectBoss', 1).whereHas('user', () => {})
                })
              })
            } else {
              // Gerente/jefe: solo solicitudes de empleados cuyo jefe directo (primero) es el usuario actual
              q.whereHas('employee', (employeeQuery) => {
                employeeQuery.whereHas('userResponsibleEmployee', (ureQ) => {
                  ureQ.where('userId', user.userId).where('userResponsibleEmployeeDirectBoss', 1)
                })
              })
            }
          })

      const query = aplicarFiltrosComunes(ExceptionRequest.query())
        .preload('employee', (employeeQuery) => {
          // Solo lo que la bandeja pinta. El modelo completo arrastraba el
          // número de empleado, el salario diario y el resto del expediente a
          // una pantalla que únicamente muestra nombre, puesto, departamento y
          // sucursal: menos campos en el payload, menos superficie expuesta.
          // Las llaves foráneas van incluidas porque los preloads las necesitan.
          employeeQuery.select([
            'employeeId',
            'personId',
            'departmentId',
            'positionId',
            'businessUnitId',
            // La foto sí viaja: el avatar de la bandeja la pide al endpoint
            // autenticado con esta clave.
            'employeePhoto',
          ])
          employeeQuery.preload('department')
          employeeQuery.preload('position')
          employeeQuery.preload('activeEmployeeBranchOffice', (branchQuery) => {
            branchQuery.preload('branchOffice')
          })
        })
        .preload('exceptionType')
        .preload('user')
        .preload('resolvedByUser', (resolvedByQuery) => {
          resolvedByQuery.preload('person')
        })
        .if(status, (q) => q.where('exceptionRequestStatus', status))
        .orderByRaw(`CASE
                   WHEN exception_request_status = 'pending' THEN 1
                   WHEN exception_request_status = 'accepted' THEN 2
                   WHEN exception_request_status = 'refused' THEN 3
                   ELSE 4
                 END ${sortOrder}`)

      const exceptionRequests = await query.paginate(page, limit)

      response.status(200)
      return formatResponse(
        'success',
        'Exception Requests',
        'The exception requests were found successfully',
        exceptionRequests.all(),
        {
          total: exceptionRequests.total,
          per_page: exceptionRequests.perPage,
          current_page: exceptionRequests.currentPage,
          last_page: exceptionRequests.lastPage,
          first_page: 1,
        }
      )
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
  /**
   * @swagger
   * /api/exception-requests/unread:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get unread exception requests
   *     description: |
   *       Requiere autenticación. Devuelve solo las solicitudes no leídas visibles para el usuario:
   *       - Root ve todas. RRHH (rh-manager, recursos-humanos) ve solo las de empleados sin jefe directo con usuario.
   *       - El resto ve solo las de empleados cuyo jefe directo es el usuario actual.
   *     tags:
   *       - ExceptionRequests
   *     parameters:
   *       - name: rhRead
   *         in: query
   *         required: false
   *         description: >
   *           Filter by RH read status (0: unread, 1: read).
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *       - name: gerencialRead
   *         in: query
   *         required: false
   *         description: >
   *           Filter by managerial read status (0: unread, 1: read).
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *     responses:
   *       200:
   *         description: Successfully fetched unread exception requests
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Successfully fetched unread exception requests
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       exceptionRequestId:
   *                         type: integer
   *                         example: 1
   *                       employeeId:
   *                         type: integer
   *                         example: 123
   *                       exceptionTypeId:
   *                         type: integer
   *                         example: 5
   *                       exceptionRequestStatus:
   *                         type: string
   *                         example: pending
   *       400:
   *         description: Invalid query parameters
   *       403:
   *         description: Sin permiso `employees:tab-trabajo-read` (negativa del permissionGate, key `PERM.DENIED`)
   *       500:
   *         description: Internal server error
   */

  async getUnreadExceptionRequests({ auth, request, response }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        return response.status(401).json({
          type: 'error',
          title: 'Unauthorized',
          message: 'Usuario no autenticado',
        })
      }
      await user.preload('role')
      const roleSlug = user.role.roleSlug
      const hasFullVisibility = FULL_VISIBILITY_ROLE_SLUGS.includes(
        roleSlug as (typeof FULL_VISIBILITY_ROLE_SLUGS)[number]
      )
      const isRHH = RRHH_ROLE_SLUGS.includes(roleSlug as (typeof RRHH_ROLE_SLUGS)[number])

      const rhReadFilter = request.input('rhRead')
      const gerencialReadFilter = request.input('gerencialRead')

      const query = ExceptionRequest.query()
        .if(isTenantScopeActive(), (scoped) => {
          scoped.whereIn('employee_id', scopedEmployeeIds())
        })
        .if(rhReadFilter !== undefined, (q) => {
          q.where('exceptionRequestRhRead', rhReadFilter)
        })
        .if(gerencialReadFilter !== undefined, (q) => {
          q.where('exceptionRequestGerencialRead', gerencialReadFilter)
        })
        .if(rhReadFilter === undefined && gerencialReadFilter === undefined, (q) => {
          q.where('exceptionRequestRhRead', 0).where('exceptionRequestGerencialRead', 0)
        })
        .if(!hasFullVisibility, (q) => {
          if (isRHH) {
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.whereDoesntHave('userResponsibleEmployee', (ureQ) => {
                ureQ.where('userResponsibleEmployeeDirectBoss', 1).whereHas('user', () => {})
              })
            })
          } else {
            q.whereHas('employee', (employeeQuery) => {
              employeeQuery.whereHas('userResponsibleEmployee', (ureQ) => {
                ureQ.where('userId', user.userId).where('userResponsibleEmployeeDirectBoss', 1)
              })
            })
          }
        })

      const exceptionRequests = await query.exec()

      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            'Successfully fetched unread exception requests',
            'Resources fetched',
            exceptionRequests
          )
        )
    } catch (error) {
      if (error.code === 'E_UNAUTHORIZED_ACCESS') {
        return response.status(401).json({
          type: 'error',
          title: 'Unauthorized',
          message: 'Usuario no autenticado',
        })
      }
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/exception-requests/my-requests:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     summary: Get exception requests for the authenticated employee
   *     description: |
   *       Retrieve exception requests that belong to the employee associated with the authenticated user.
   *       Only returns requests if the token belongs to the employee. Returns 403 if unauthorized.
   *     tags: [ExceptionRequests]
   *     parameters:
   *       - name: page
   *         in: query
   *         required: false
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: departmentId
   *         in: query
   *         description: Filter by department ID (must match employee's department)
   *         required: false
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         description: Filter by position ID (must match employee's position)
   *         required: false
   *         schema:
   *           type: integer
   *       - name: status
   *         in: query
   *         description: Filter by exception request status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [requested, pending, accepted, refused, all]
   *       - name: sortOrder
   *         in: query
   *         description: Sort order (asc or desc)
   *         required: false
   *         schema:
   *           type: string
   *           enum: [asc, desc, ascend, descend]
   *           default: desc
   *     responses:
   *       200:
   *         description: List of exception requests retrieved successfully
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
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: integer
   *                         per_page:
   *                           type: integer
   *                         current_page:
   *                           type: integer
   *                         last_page:
   *                           type: integer
   *                         first_page:
   *                           type: integer
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           exceptionRequestId:
   *                             type: integer
   *                           employeeId:
   *                             type: integer
   *                           exceptionRequestStatus:
   *                             type: string
   *                           exceptionRequestDescription:
   *                             type: string
   *                           requestedDate:
   *                             type: string
   *                             example: "2024-11-15 14:00:00"
   *       403:
   *         description: Forbidden - User does not have an associated employee or unauthorized access
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
   *                   example: Forbidden
   *                 message:
   *                   type: string
   *                   example: You do not have permission to access this resource
   *       400:
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       500:
   *         description: Unexpected error
   */
  async getMyExceptionRequests({ auth, request, response }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user

      if (!user) {
        response.status(403)
        return {
          type: 'error',
          title: 'Forbidden',
          message: 'You do not have permission to access this resource',
        }
      }

      // Obtener el personId del usuario autenticado
      await user.load('person')
      if (!user.person || !user.person.personId) {
        response.status(403)
        return {
          type: 'error',
          title: 'Forbidden',
          message: 'User does not have an associated person',
        }
      }

      // Buscar el empleado asociado al personId del usuario
      const employee = await Employee.query()
        .where('personId', user.person.personId)
        .whereNull('employee_deleted_at')
        .first()

      if (!employee) {
        response.status(403)
        return {
          type: 'error',
          title: 'Forbidden',
          message: 'You do not have an associated employee record',
        }
      }

      // Obtener parámetros de filtro
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const sortOrder = request.input('sortOrder', 'desc') || 'descend'
      let departmentId = request.input('departmentId')
      let positionId = request.input('positionId')
      let status = request.input('status')

      // Validar que los filtros de departamento y posición coincidan con el empleado
      if (departmentId && departmentId !== '9999') {
        if (employee.departmentId !== Number(departmentId)) {
          response.status(403)
          return {
            type: 'error',
            title: 'Forbidden',
            message: 'You do not have permission to filter by this department',
          }
        }
      }

      if (positionId && positionId !== '9999') {
        if (employee.positionId !== Number(positionId)) {
          response.status(403)
          return {
            type: 'error',
            title: 'Forbidden',
            message: 'You do not have permission to filter by this position',
          }
        }
      }

      // Normalizar valores especiales
      if (departmentId === '9999') {
        departmentId = null
      }
      if (positionId === '9999') {
        positionId = null
      }
      if (status === 'all') {
        status = null
      }

      // Construir la consulta base - SOLO del empleado autenticado
      const query = ExceptionRequest.query()
        .where('employeeId', employee.employeeId)
        .preload('employee', (employeeQuery) => {
          employeeQuery.preload('department')
          employeeQuery.preload('position')
        })
        .preload('exceptionType')
        .preload('user')
        .if(departmentId, (q) => {
          q.whereHas('employee', (employeeQuery) => {
            employeeQuery.where('departmentId', departmentId)
          })
        })
        .if(positionId, (q) => {
          q.whereHas('employee', (employeeQuery) => {
            employeeQuery.where('positionId', positionId)
          })
        })
        .if(status, (q) => q.where('exceptionRequestStatus', status))
        .orderByRaw(`CASE
                     WHEN exception_request_status = 'pending' THEN 1
                     WHEN exception_request_status = 'accepted' THEN 2
                     WHEN exception_request_status = 'refused' THEN 3
                     ELSE 4
                   END ${sortOrder}`)

      const exceptionRequests = await query.paginate(page, limit)

      // Cuántos comprobantes propios trae cada solicitud. El colaborador no ve
      // los que Recursos Humanos guardó en el expediente, así que el conteo se
      // acota a los que él mismo subió: es la confirmación de que su archivo
      // llegó, no un inventario del expediente.
      const comprobantesPropios = await this.countOwnAttachments(
        exceptionRequests.all().map((solicitud) => solicitud.exceptionRequestId),
        user.userId
      )

      response.status(200)
      return formatResponse(
        'success',
        'Exception Requests',
        'Your exception requests were found successfully',
        exceptionRequests.all().map((solicitud) => ({
          ...solicitud.serialize(),
          attachmentsCount: comprobantesPropios.get(solicitud.exceptionRequestId) ?? 0,
        })),
        {
          total: exceptionRequests.total,
          per_page: exceptionRequests.perPage,
          current_page: exceptionRequests.currentPage,
          last_page: exceptionRequests.lastPage,
          first_page: 1,
        }
      )
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
