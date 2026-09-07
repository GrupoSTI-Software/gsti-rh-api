import type { HttpContext } from '@adonisjs/core/http'
import Notice from '#models/notice'
import NoticeFile from '#models/notice_file'
import NoticeRecipient from '#models/notice_recipient'
import StoredFileStreamService from '#services/stored_file_stream_service'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { resolveSessionEmployeeId } from '#helpers/resolve_session_employee_id'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { NOTICES_READ_PERMISSION_DECLARATIONS } from '#constants/notices_permission_declarations'
import type { PermissionGateOptions } from '#constants/permission_gate'

/**
 * Resultado de autorizar el acceso a un aviso. `denied` significa que el gate
 * ya escribió el 403 y el handler solo debe salir.
 */
type NoticeAccess = { kind: 'ok'; notice: Notice } | { kind: 'not-found' } | { kind: 'denied' }

/**
 * Salida de los archivos de un aviso (ESB-04-02-08-01 §9.6, fase B5).
 *
 * ## Por qué DOS rutas y no una
 * Los avisos de tipo imagen o PDF **no crean fila** en `notice_files`: guardan
 * la key del archivo en `notice_description`, y solo los de tipo `text` crean
 * filas. Son excluyentes, así que un solo endpoint tendría que adivinar dónde
 * mirar.
 *
 * ## Autorización
 * Igual que `index` y `show`: la PRESENCIA de `employeeId` en el query decide
 * la vista y su VALOR se descarta, lo pone la sesión. No se ramifica por "la
 * sesión tiene colaborador": el backoffice pide los binarios sin `employeeId`
 * y su usuario suele tener fila en `employees` (RH la tiene), con lo que caía
 * en la vista del colaborador y no podía previsualizar un borrador.
 *
 * Con `employeeId` (la app): el aviso debe estar ENVIADO y tener la fila viva
 * del colaborador en `notice_recipients`; un borrador o un programado no
 * existe para la app, aunque ya tenga la fila. Sin `employeeId` (backoffice):
 * exige el permiso de lectura del módulo (evaluado aquí y no en el router,
 * porque la ruta se comparte con la app) y que el aviso caiga en su scope de
 * unidades, sin exigir que esté enviado.
 *
 * Aviso ajeno o inexistente: **404, nunca 403**. Un 403 distinguiría "existe
 * pero no es tuyo" de "no existe" y revelaría la existencia del aviso. Espejo
 * literal de `shift_exception_evidence_stream_controller`. La única salida 403
 * es la del gate de permisos de administración, la misma de cualquier ruta del
 * backoffice.
 */
export default class NoticeFileStreamController {
  private async resolveAccess(
    ctx: HttpContext,
    noticeId: number,
    permission: PermissionGateOptions
  ): Promise<NoticeAccess> {
    // Un employeeId ajeno no devuelve 403 sino lo propio (con -1 nunca habrá
    // fila y sale 404), por la misma razón que en `index`.
    const rawEmployeeId = ctx.request.input('employeeId')
    const employeeId = rawEmployeeId ? ((await resolveSessionEmployeeId(ctx)) ?? -1) : undefined

    // Sin `employeeId` es administración: el permiso se resuelve ANTES de tocar
    // el aviso, para que la negativa no dependa de si existe.
    if (employeeId === undefined) {
      const allowed = await ensureSecondaryPermission(ctx, permission)
      if (!allowed) return { kind: 'denied' }
    }

    const notice = await Notice.query()
      .where('notice_id', noticeId)
      .whereNull('notice_deleted_at')
      .first()
    if (!notice) return { kind: 'not-found' }

    if (employeeId !== undefined) {
      // Un borrador o un programado no existe para el colaborador, aunque ya
      // tenga su fila de destinatario.
      if (!notice.noticeSentAt) return { kind: 'not-found' }
      // Un aviso de otra empresa nunca te tiene de destinatario, así que la
      // fila de destinatario basta como candado: no hace falta el tenant.
      const recipient = await NoticeRecipient.query()
        .where('notice_id', noticeId)
        .where('employee_id', employeeId)
        .whereNull('notice_recipient_deleted_at')
        .first()
      return recipient ? { kind: 'ok', notice } : { kind: 'not-found' }
    }

    // Vista de administración: el candado es el scope de unidades, con los
    // avisos legacy de unidad NULL incluidos por la misma razón que en el listado.
    const scopeIds = await new BusinessAccessScopeService().getAccessibleIds(ctx.auth.user!)
    if (notice.businessUnitId === null) return { kind: 'ok', notice }
    return scopeIds.includes(notice.businessUnitId) ? { kind: 'ok', notice } : { kind: 'not-found' }
  }

  private notFound(response: HttpContext['response']) {
    response.status(404)
    return {
      type: 'warning',
      title: 'Archivo no encontrado',
      detail: 'El archivo no existe o no está disponible para tu cuenta.',
      key: 'aviso-archivo-no-encontrado',
    }
  }

  private invalidId(response: HttpContext['response'], key: string) {
    response.status(400)
    return {
      type: 'error',
      title: 'Error de validación',
      detail: 'El identificador recibido es inválido.',
      key,
    }
  }

  /**
   * @swagger
   * /api/notices/{noticeId}/files/{noticeFileId}/content:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: Binario de un adjunto del aviso
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Presence selects the employee view (value ignored, resolved from the session); absence is the backoffice view and requires the module read permission
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario del adjunto
   *       400:
   *         description: Identificador inválido
   *       403:
   *         description: Vista de administración sin permiso de lectura del módulo
   *       404:
   *         description: El aviso o el adjunto no existen, no están enviados (vista del colaborador) o no son de tu cuenta
   */
  async fileContent(ctx: HttpContext) {
    const { request, response, logger } = ctx
    const noticeId = Number(request.param('noticeId'))
    const noticeFileId = Number(request.param('noticeFileId'))

    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return this.invalidId(response, 'aviso-id-invalido')
    }
    if (!Number.isInteger(noticeFileId) || noticeFileId <= 0) {
      return this.invalidId(response, 'aviso-archivo-id-invalido')
    }

    const access = await this.resolveAccess(
      ctx,
      noticeId,
      NOTICES_READ_PERMISSION_DECLARATIONS.fileContent
    )
    if (access.kind === 'denied') return
    if (access.kind === 'not-found') return this.notFound(response)

    const file = await NoticeFile.query()
      .where('notice_file_id', noticeFileId)
      .where('notice_id', noticeId)
      .whereNull('notice_file_deleted_at')
      .first()
    if (!file?.noticeFilePath) return this.notFound(response)

    try {
      response.header('Content-Disposition', 'inline')
      const entregado = await new StoredFileStreamService().streamInto(
        { response },
        file.noticeFilePath
      )
      if (entregado) return
      logger.warn({ noticeFileId }, 'Adjunto registrado pero ausente en el almacenamiento')
      return this.notFound(response)
    } catch (error) {
      logger.error({ err: error, noticeFileId }, 'Error inesperado al entregar el adjunto')
      response.status(500)
      return {
        type: 'error',
        title: 'Error inesperado',
        detail: 'No se pudo entregar el archivo.',
        key: 'aviso-archivo-error',
      }
    }
  }

  /**
   * @swagger
   * /api/notices/{noticeId}/body-file:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: Cuerpo del aviso cuando es un archivo (imagen o PDF)
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Presence selects the employee view (value ignored, resolved from the session); absence is the backoffice view and requires the module read permission
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario del cuerpo
   *       400:
   *         description: Identificador inválido
   *       403:
   *         description: Vista de administración sin permiso de lectura del módulo
   *       404:
   *         description: El aviso no existe, no está enviado (vista del colaborador), no es de tu cuenta o su cuerpo no es un archivo
   */
  async bodyFile(ctx: HttpContext) {
    const { request, response, logger } = ctx
    const noticeId = Number(request.param('noticeId'))

    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return this.invalidId(response, 'aviso-id-invalido')
    }

    const access = await this.resolveAccess(ctx, noticeId, NOTICES_READ_PERMISSION_DECLARATIONS.bodyFile)
    if (access.kind === 'denied') return
    // Solo los avisos que NO son de texto guardan su cuerpo como archivo.
    if (
      access.kind === 'not-found' ||
      access.notice.noticeType === 'text' ||
      !access.notice.noticeDescription
    ) {
      return this.notFound(response)
    }

    try {
      response.header('Content-Disposition', 'inline')
      const entregado = await new StoredFileStreamService().streamInto(
        { response },
        access.notice.noticeDescription
      )
      if (entregado) return
      logger.warn({ noticeId }, 'Cuerpo-archivo registrado pero ausente en el almacenamiento')
      return this.notFound(response)
    } catch (error) {
      logger.error({ err: error, noticeId }, 'Error inesperado al entregar el cuerpo del aviso')
      response.status(500)
      return {
        type: 'error',
        title: 'Error inesperado',
        detail: 'No se pudo entregar el archivo.',
        key: 'aviso-archivo-error',
      }
    }
  }
}
