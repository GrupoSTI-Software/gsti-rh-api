import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { NOTICES_WRITE_PERMISSION_DECLARATIONS } from '#constants/notices_permission_declarations'

/**
 * Lecturas compartidas por la app del empleado y el backoffice.
 *
 * Montan `businessScope()` como el resto de rutas con datos de empresa. Antes no
 * lo hacían porque `notices.business_unit_id` era nullable y el filtro de tenant
 * dejaba fuera los avisos sin empresa; eso se resolvió de raíz: el alta ya
 * asigna la empresa y la columna es obligatoria, así que no quedan avisos que
 * excluir y el mixin del modelo hace todo el corte.
 *
 * La app del empleado envía `x-business-unit-id` en cada petición y el
 * colaborador tiene fila en `business_unit_users`, así que pasa el middleware.
 *
 * Sin `permissionGate` aquí a propósito: la misma ruta sirve a la app (que se
 * identifica por su fila de destinatario y solo ve lo enviado) y al backoffice.
 * El permiso `read` del módulo se evalúa en el controlador únicamente en la
 * rama de administración (sin `employeeId` / sin colaborador en la sesión).
 */
router
  .group(() => {
    router.get('/unread-count', '#controllers/notice_controller.getUnreadCount')
    router.get('/', '#controllers/notice_controller.index')
    router.get('/:noticeId', '#controllers/notice_controller.show')
    router.post('/:noticeId/mark-as-read', '#controllers/notice_controller.markAsRead')
    router.get(
      '/:noticeId/files/:noticeFileId/content',
      '#controllers/notice_file_stream_controller.fileContent'
    )
    router.get('/:noticeId/body-file', '#controllers/notice_file_stream_controller.bodyFile')
  })
  .prefix('/api/notices')
  .use(middleware.auth())
  .use(middleware.businessScope())

/**
 * Operaciones de administración: exigen empresa activa (defensa en profundidad)
 * y el permiso del módulo `avisos-y-noticias` declarado en
 * `notices_permission_declarations.ts`.
 */
router
  .group(() => {
    router
      .post('/', '#controllers/notice_controller.store')
      .use(middleware.permissionGate(NOTICES_WRITE_PERMISSION_DECLARATIONS.store))
    router
      .put('/:noticeId', '#controllers/notice_controller.update')
      .use(middleware.permissionGate(NOTICES_WRITE_PERMISSION_DECLARATIONS.update))
    router
      .delete('/:noticeId', '#controllers/notice_controller.delete')
      .use(middleware.permissionGate(NOTICES_WRITE_PERMISSION_DECLARATIONS.delete))
    router
      .post('/:noticeId/send', '#controllers/notice_controller.send')
      .use(middleware.permissionGate(NOTICES_WRITE_PERMISSION_DECLARATIONS.send))
    router
      .post('/:noticeId/duplicate', '#controllers/notice_controller.duplicate')
      .use(middleware.permissionGate(NOTICES_WRITE_PERMISSION_DECLARATIONS.duplicate))
  })
  .prefix('/api/notices')
  .use(middleware.auth())
  .use(middleware.businessScope())
