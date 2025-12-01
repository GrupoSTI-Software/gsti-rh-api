import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.post('/', '#controllers/face_controller.verify')
  })
  .prefix('/api/verify-face')