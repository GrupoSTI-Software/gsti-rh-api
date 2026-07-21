import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Lecturas de la app empleado: solo auth(), sin empresa activa en header.
 * USRH1784316436823 — no montar businessScope aquí (rompería la app).
 */
router
  .group(() => {
    router.get('/unread-count', '#controllers/notice_controller.getUnreadCount')
    router.get('/', '#controllers/notice_controller.index')
    router.get('/:noticeId', '#controllers/notice_controller.show')
    router.post('/:noticeId/mark-as-read', '#controllers/notice_controller.markAsRead')
  })
  .prefix('/api/notices')
  .use(middleware.auth())

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
