import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/unread-count', '#controllers/notice_controller.getUnreadCount')
    router.get('/', '#controllers/notice_controller.index')
    router.post('/', '#controllers/notice_controller.store')
    router.get('/:noticeId', '#controllers/notice_controller.show')
    router.put('/:noticeId', '#controllers/notice_controller.update')
    router.delete('/:noticeId', '#controllers/notice_controller.delete')
    router.post('/:noticeId/send', '#controllers/notice_controller.send')
    router.post('/:noticeId/mark-as-read', '#controllers/notice_controller.markAsRead')
  })
  .prefix('/api/notices')
  .use(middleware.auth())
