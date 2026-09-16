import type { HttpContext } from '@adonisjs/core/http'
import PlatformDeviceAssignmentService from '#services/platform_device_assignment_service'
import {
  createDeviceAssignmentValidator,
  listDeviceAssignmentsValidator,
  unassignDeviceValidator,
} from '#validators/platform_device_assignment'
import { resolvePlatformDeviceApiError } from '../helpers/platform_device_api_error.js'

/**
 * Controlador de asignaciones de aparatos a empresas cliente.
 * Todos los endpoints requieren `auth` + `platformAdmin`. Sin `businessScope`.
 *
 * Prefijo: /api/platform/devices/assignments
 * Ref: USRH1787189981876 · §11 del spec.
 */
export default class PlatformDeviceAssignmentController {
  private readonly service = new PlatformDeviceAssignmentService()

  /**
   * @swagger
   * /api/platform/devices/assignments:
   *   post:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Asignar una unidad disponible a un tenant
   *     description: >
   *       Registra la entrega de un aparato del inventario a una empresa cliente.
   *       Operación atómica: crea la asignación y cambia el estado del aparato
   *       a `asignada` en una sola transacción con bloqueo pesimista (forUpdate)
   *       sobre la fila del aparato. Garantiza que nunca queden dos entregas
   *       abiertas para el mismo aparato, incluso con peticiones concurrentes.
   *
   *       Dentro de la misma transacción precarga (crea o adopta) el punto de
   *       acceso del tenant, amarrado a la unidad por `platformDeviceId`
   *       (USRH1787189981879). La respuesta incluye `accessPointOutcome`
   *       (`created` | `adopted`) y el `accessPoint` resultante.
   *
   *       Condiciones previas:
   *       - El tenant debe tener la habilitación de biométricos encendida.
   *       - El aparato debe estar en estado `disponible`.
   *       - `deliveredAt` no puede ser futura.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - platformDeviceId
   *               - tenantPublicId
   *               - deliveredAt
   *               - tenureRegime
   *             properties:
   *               platformDeviceId:
   *                 type: integer
   *                 example: 41
   *               tenantPublicId:
   *                 type: string
   *                 format: uuid
   *               deliveredAt:
   *                 type: string
   *                 format: date
   *                 example: "2026-08-20"
   *               tenureRegime:
   *                 type: string
   *                 enum: [comodato, venta, propiedad_cliente]
   *                 description: >
   *                   Figura bajo la que queda el equipo. Restringida por el
   *                   origen de la unidad: del_cliente solo admite
   *                   propiedad_cliente; propia admite comodato o venta.
   *               salePriceCents:
   *                 type: integer
   *                 description: Obligatorio y solo permitido cuando tenureRegime = venta. Centavos MXN.
   *                 example: 1250000
   *     responses:
   *       '201':
   *         description: Asignación registrada
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 assignmentId: 1
   *                 deviceId: 41
   *                 serialNumber: "AXK9-00001"
   *                 tenant:
   *                   publicId: "uuid"
   *                   name: "Empresa ABC"
   *                 deliveredAt: "2026-08-20"
   *                 releasedAt: null
   *                 deviceStatus: "asignada"
   *                 accessPointOutcome: "created"
   *                 accessPoint:
   *                   accessPointId: 412
   *                   accessPointName: "ZKTeco SpeedFace V5L · 8A31"
   *                   accessPointSerialNumber: "CJ9F2400A8A31"
   *                 tenureRegime: "venta"
   *                 salePriceCents: 1250000
   *                 saleCurrency: "MXN"
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.DEVICE_NOT_FOUND | PLT.DEV.TENANT_NOT_FOUND
   *       '409':
   *         description: >
   *           PLT.DEV.SERIAL_TAKEN_BY_OTHER_TENANT — Serie ya viva como punto de acceso en otra empresa |
   *           PLT.DEV.SERIAL_TAKEN_BY_AUTODISCOVERY — Serie ya viva por auto-descubrimiento en otra empresa
   *       '422':
   *         description: >
   *           PLT.DEV.VAL_INPUT — Body inválido o fecha futura |
   *           PLT.DEV.ASSIGN_NOT_AVAILABLE — Aparato ya asignado o retirado |
   *           PLT.DEV.ASSIGN_TENANT_NOT_ENABLED — Tenant sin habilitación de biométricos |
   *           PLT.DEV.DEVICE_SERIAL_MISSING — La unidad no tiene número de serie registrado |
   *           PLT.DEV.SALE_PRICE_REQUIRED — Régimen venta sin precio |
   *           PLT.DEV.SALE_PRICE_NOT_ALLOWED — Precio con régimen que no lo admite |
   *           PLT.DEV.TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN — Régimen incompatible con el origen de la unidad
   *       '500':
   *         description: PLT.DEV.ACCESS_POINT_PRELOAD_FAILED — Falló la materialización del punto de acceso
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createDeviceAssignmentValidator)
      const userId = auth.user?.userId ?? null

      const assignment = await this.service.createAssignment({
        platformDeviceId: data.platformDeviceId,
        tenantPublicId: data.tenantPublicId,
        deliveredAt: data.deliveredAt,
        tenureRegime: data.tenureRegime,
        salePriceCents: data.salePriceCents,
        createdByUserId: userId ?? undefined,
      })

      return response.status(201).json({ type: 'success', data: assignment })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/assignments:
   *   get:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Listar asignaciones de un tenant
   *     description: >
   *       Devuelve las asignaciones de un tenant. Por defecto solo las abiertas
   *       (`status=open`). `status=all` incluye el historial completo.
   *       `tenantPublicId` es obligatorio. Sin paginación: un tenant tiene
   *       unidades, no cientos. El tenant debe tener biométricos habilitados.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: tenantPublicId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [open, all]
   *           default: open
   *     responses:
   *       '200':
   *         description: Listado de asignaciones
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 - assignmentId: 1
   *                   deviceId: 41
   *                   serialNumber: "AXK9-00001"
   *                   model:
   *                     id: 1
   *                     name: "ZKTeco SpeedFace V5L"
   *                     slug: "zkteco-speedface-v5l"
   *                   deliveredAt: "2026-08-20"
   *                   tenureRegime: "venta"
   *                   salePriceCents: 1250000
   *                   saleCurrency: "MXN"
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.TENANT_NOT_FOUND
   *       '422':
   *         description: >
   *           PLT.DEV.VAL_INPUT — Query inválida o tenantPublicId ausente |
   *           PLT.DEV.ASSIGN_TENANT_NOT_ENABLED — Tenant sin habilitación de biométricos
   */
  async index({ request, response }: HttpContext) {
    try {
      const query = await request.validateUsing(listDeviceAssignmentsValidator)
      const assignments = await this.service.listByTenant({
        tenantPublicId: query.tenantPublicId,
        status: query.status,
      })
      return response.status(200).json({ type: 'success', data: assignments })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/units/{platformDeviceId}/unassign:
   *   post:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Cerrar la entrega vigente de una unidad
   *     description: >
   *       Cierra la asignación vigente del aparato con fecha de regreso y
   *       motivo, y resuelve su destino en una sola transacción con bloqueo
   *       pesimista (forUpdate) sobre la fila del aparato
   *       (USRH1787189981881):
   *
   *       - Por defecto la unidad vuelve a `disponible`.
   *       - Si la entrega cerrada era de régimen `venta`, la unidad se
   *         retira con motivo `vendido` (terminal, no vuelve a disponible).
   *       - Si el origen de la unidad es `del_cliente`, se retira con motivo
   *         `del_cliente` cualquiera que sea el motivo de liberación
   *         capturado (terminal).
   *
   *       La asignación cerrada nunca se borra ni se sobrescribe: conserva
   *       fecha de entrega, fecha de regreso, motivo y figura de tenencia.
   *
   *       Además desactiva (nunca borra) el punto de acceso del tenant
   *       ligado a la unidad (USRH1787189981883). El desenlace se informa
   *       en `accessPointOutcome`: `desactivado` si existía y se apagó, o
   *       `ausente` si el cliente ya lo había borrado o nunca se precargó.
   *       Si la desactivación falla por una causa técnica, toda la
   *       desasignación se revierte (PLT.DEV.AP_DEACTIVATE_FAILED, 422).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformDeviceId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - releasedAt
   *               - releaseReason
   *             properties:
   *               releasedAt:
   *                 type: string
   *                 format: date
   *                 example: "2026-08-18"
   *               releaseReason:
   *                 type: string
   *                 enum: [devolucion_comodato, cambio_equipo, baja_cliente]
   *     responses:
   *       '200':
   *         description: Entrega cerrada
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 assignment:
   *                   id: 12
   *                   tenantPublicId: "uuid"
   *                   deliveredAt: "2026-05-02"
   *                   releasedAt: "2026-08-18"
   *                   releaseReason: "devolucion_comodato"
   *                   tenureRegime: "comodato"
   *                 device:
   *                   id: 7
   *                   serialNumber: "AXK9-00001"
   *                   stockStatus: "disponible"
   *                   retireReason: null
   *                 accessPointOutcome: "desactivado"
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.DEVICE_NOT_FOUND
   *       '422':
   *         description: >
   *           PLT.DEV.VAL_INPUT — Body inválido (releaseReason ausente o fuera de catálogo) |
   *           PLT.DEV.NO_OPEN_ASSIGNMENT — La unidad no tiene entrega vigente que cerrar |
   *           PLT.DEV.RELEASE_DATE_INVALID — Fecha de regreso anterior a la entrega o posterior a hoy |
   *           PLT.DEV.AP_DEACTIVATE_FAILED — Falló la desactivación del punto de acceso del tenant; la desasignación se revirtió por completo
   *       '500':
   *         description: PLT.DEV.SYS_UNHANDLED
   */
  async unassign({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(unassignDeviceValidator)
      const result = await this.service.unassign(Number(params.platformDeviceId), {
        releasedAt: data.releasedAt,
        releaseReason: data.releaseReason,
      })

      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}
