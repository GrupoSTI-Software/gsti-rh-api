import type { HttpContext } from '@adonisjs/core/http'
import Notice from '#models/notice'
import NoticeFile from '#models/notice_file'
import NoticeRecipient from '#models/notice_recipient'
import StoredFileStreamService from '#services/stored_file_stream_service'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { resolveSessionEmployeeId } from '#helpers/resolve_session_employee_id'

/**
 * Salida de los archivos de un aviso (ESB-04-02-08-01 §9.6, fase B5).
 *
 * ## Por qué DOS rutas y no una
 * Los avisos de tipo imagen o PDF **no crean fila** en `notice_files`: guardan
 * la key del archivo en `notice_description`, y solo los de tipo `text` crean
 * filas. Son excluyentes, así que un solo endpoint tendría que adivinar dónde
 * mirar. Hoy esa key privada el cliente la imprime como texto en pantalla.
 *
 * ## Autorización
 * Fila viva en `notice_recipients` con el colaborador de la sesión. Si la
 * sesión no tiene colaborador ligado —un usuario de backoffice—, el aviso debe
 * caer en su scope de unidades.
 *
 * En cualquier otro caso **404, nunca 403**: un 403 distinguiría "existe pero no
 * es tuyo" de "no existe" y revelaría la existencia del aviso. Espejo literal
 * de `shift_exception_evidence_stream_controller`.
 */
export default class NoticeFileStreamController {
  /** Un aviso al que la sesión tiene derecho, o `null`. */
  private async authorizedNotice(ctx: HttpContext, noticeId: number): Promise<Notice | null> {
    const notice = await Notice.query()
      .where('notice_id', noticeId)
      .whereNull('notice_deleted_at')
      .first()
    if (!notice) return null

    const employeeId = await resolveSessionEmployeeId(ctx)
    if (employeeId !== null) {
      // Un aviso de otra empresa nunca te tiene de destinatario, así que la
      // fila de destinatario basta como candado: no hace falta el tenant.
      const recipient = await NoticeRecipient.query()
        .where('notice_id', noticeId)
        .where('employee_id', employeeId)
        .whereNull('notice_recipient_deleted_at')
        .first()
      return recipient ? notice : null
    }

    // Sesión sin colaborador: es la vista de administración y el candado pasa a
    // ser el scope de unidades, con los avisos legacy de unidad NULL incluidos
    // por la misma razón que en el listado.
    const scopeIds = await new BusinessAccessScopeService().getAccessibleIds(ctx.auth.user!)
    if (notice.businessUnitId === null) return notice
    return scopeIds.includes(notice.businessUnitId) ? notice : null
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
   *     responses:
   *       200:
   *         description: Binario del adjunto
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: El aviso o el adjunto no existen, o no son de tu cuenta
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

    const notice = await this.authorizedNotice(ctx, noticeId)
    if (!notice) return this.notFound(response)

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
   *     responses:
   *       200:
   *         description: Binario del cuerpo
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: El aviso no existe, no es de tu cuenta o su cuerpo no es un archivo
   */
  async bodyFile(ctx: HttpContext) {
    const { request, response, logger } = ctx
    const noticeId = Number(request.param('noticeId'))

    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return this.invalidId(response, 'aviso-id-invalido')
    }

    const notice = await this.authorizedNotice(ctx, noticeId)
    // Solo los avisos que NO son de texto guardan su cuerpo como archivo.
    if (!notice || notice.noticeType === 'text' || !notice.noticeDescription) {
      return this.notFound(response)
    }

    try {
      response.header('Content-Disposition', 'inline')
      const entregado = await new StoredFileStreamService().streamInto(
        { response },
        notice.noticeDescription
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
