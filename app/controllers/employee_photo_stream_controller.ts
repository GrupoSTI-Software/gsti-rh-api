import type { HttpContext } from '@adonisjs/core/http'
import Employee from '#models/employee'
import StoredFileStreamService from '#services/stored_file_stream_service'

/**
 * Salida de la foto de perfil de un empleado.
 *
 * Reemplaza a `GET /api/proxy-image`, que era pública, recibía una URL
 * arbitraria por query param y hacía que el servidor la fuera a buscar. Aquí el
 * cliente pide un empleado; la referencia del archivo la resuelve el servidor
 * desde el propio registro y nunca viaja en la petición.
 *
 * La foto se guarda como objeto privado desde el endurecimiento de la subida,
 * así que este endpoint es la forma de mostrarla en el backoffice y en la app.
 *
 * `me` es la MISMA salida para el dueño de la foto (app del colaborador). No
 * recibe identificador: resuelve el empleado por el `personId` de la sesión y
 * por el scope de empresa que dejó `BusinessUnitScopeMiddleware` en
 * `ctx.businessUnitScope` (`business_unit_scope_middleware.ts:112`) — mismo
 * predicado que `BadgeRepositoryMysql.findActiveEmployeeByPersonId`. Por eso su
 * ruta no lleva `permissionGate`: no hay nada que autorizar más allá de estar
 * autenticado dentro del tenant.
 */
export default class EmployeePhotoStreamController {
  /**
   * @swagger
   * /api/employees/{employeeId}/photo:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Foto de perfil del empleado
   *     description: |
   *       Entrega el binario de la foto del empleado. La clave del objeto se
   *       resuelve desde el registro; el cliente nunca envía rutas de
   *       almacenamiento.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario de la imagen
   *         content:
   *           image/jpeg:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: El empleado no existe o no tiene foto
   */
  async show({ request, response, logger }: HttpContext) {
    const employeeIdRaw = request.param('employeeId')
    const employeeId = Number(employeeIdRaw)

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      response.status(400)
      return {
        type: 'error',
        title: 'Error de validación',
        detail: 'El identificador del empleado es inválido.',
        key: 'empleado-id-invalido',
      }
    }

    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    return this.streamPhotoOf({ response, logger }, employee)
  }

  /**
   * @swagger
   * /api/employees/me/photo:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Foto de perfil propia del usuario autenticado
   *     description: |
   *       Contrato para la app del colaborador. Resuelve el empleado por el
   *       `personId` de la sesión dentro de la unidad de negocio activa; jamás
   *       acepta un `employeeId` del cliente. Se registra ANTES de
   *       `/{employeeId}/photo` en el router y no lleva `permissionGate`.
   *
   *       Emite `ETag` y `Last-Modified` cuando la foto vive en el bucket. Las
   *       fotos alojadas en el servidor de biométricos se entregan como buffer
   *       y no traen esas cabeceras.
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *         description: "Unidad de negocio seleccionada (scope del tenant)."
   *     responses:
   *       200:
   *         description: Binario de la imagen
   *         content:
   *           image/jpeg:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: Falta el header X-Business-Unit-Id (key `BU.VAL.000`)
   *       401:
   *         description: Sin autenticación
   *       404:
   *         description: |
   *           El usuario no tiene empleado en la unidad activa, el empleado no
   *           tiene foto (`foto-no-encontrada`) o la foto registrada no está en
   *           el almacenamiento (`foto-no-disponible`). Los tres casos son
   *           indistinguibles a propósito.
   */
  async me({ auth, response, logger, businessUnitScope }: HttpContext) {
    const employee = await Employee.query()
      .where('person_id', auth.user!.personId)
      .whereIn('business_unit_id', businessUnitScope)
      .whereNull('employee_deleted_at')
      .first()

    return this.streamPhotoOf({ response, logger }, employee)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Tramo común de `show` y `me`: entrega los bytes o el 404 de dominio.
   *
   * Recibe el empleado ya resuelto —cada superficie lo resuelve con su propio
   * criterio— y trata "no hay empleado" y "no hay foto" con la misma respuesta:
   * distinguirlos filtraría existencia sin ganar nada.
   */
  private async streamPhotoOf(
    ctx: Pick<HttpContext, 'response' | 'logger'>,
    employee: Employee | null
  ) {
    const { response, logger } = ctx

    if (!employee || !employee.employeePhoto) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Foto no encontrada',
        detail: 'El empleado no tiene una foto de perfil registrada.',
        key: 'foto-no-encontrada',
      }
    }

    const employeeId = employee.employeeId

    try {
      const entregada = await new StoredFileStreamService().streamEmployeePhotoInto(
        { response },
        employee.employeePhoto
      )

      if (entregada) return

      logger.warn(
        { employeeId },
        'Foto de empleado registrada en base de datos pero ausente en el almacenamiento'
      )
      response.status(404)
      return {
        type: 'warning',
        title: 'Foto no encontrada',
        detail: 'La foto registrada no está disponible en el almacenamiento.',
        key: 'foto-no-disponible',
      }
    } catch (error) {
      logger.error({ err: error, employeeId }, 'Error inesperado al entregar la foto del empleado')
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        detail: 'No fue posible obtener la foto del empleado.',
        key: 'foto-error-servidor',
      }
    }
  }
}
