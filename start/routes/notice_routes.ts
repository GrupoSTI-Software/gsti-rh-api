import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Lecturas de la app empleado.
 *
 * Montan `businessScope()` como el resto de rutas con datos de empresa. Antes no
 * lo hacían porque `notices.business_unit_id` era nullable y el filtro de tenant
 * dejaba fuera los avisos sin empresa; eso se resolvió de raíz: el alta ya
 * asigna la empresa y la columna es obligatoria, así que no quedan avisos que
 * excluir y el mixin del modelo hace todo el corte.
 *
 * La app del empleado envía `x-business-unit-id` en cada petición y el
 * colaborador tiene fila en `business_unit_users`, así que pasa el middleware.
 */
router
  .group(() => {
    router.get('/unread-count', '#controllers/notice_controller.getUnreadCount')
    router.get('/', '#controllers/notice_controller.index')
    router.get('/:noticeId', '#controllers/notice_controller.show')
    router.post('/:noticeId/mark-as-read', '#controllers/notice_controller.markAsRead')
    // Los binarios van en el grupo de lectura: montar businessScope reintroduciria
    // el problema de los avisos con unidad NULL.
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
 * Operaciones de administración: exigen empresa activa (defensa en profundidad).
 */
router
  .group(() => {
    router.post('/', '#controllers/notice_controller.store')
    router.put('/:noticeId', '#controllers/notice_controller.update')
    router.delete('/:noticeId', '#controllers/notice_controller.delete')
    router.post('/:noticeId/send', '#controllers/notice_controller.send')
  })
  .prefix('/api/notices')
  .use(middleware.auth())
  .use(middleware.businessScope())
