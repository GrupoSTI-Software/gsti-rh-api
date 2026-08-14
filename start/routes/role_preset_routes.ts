import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/role_preset_controller.index')
  })
  .prefix('/api/role-presets')
  .use([middleware.auth(), middleware.businessScope()])

router
  .group(() => {
    router.post('/role-presets/preview', '#controllers/role_preset_controller.preview')
    router.post('/role-presets/apply', '#controllers/role_preset_controller.apply')
  })
  .prefix('/api/roles/:roleId')
  .use([middleware.auth(), middleware.businessScope()])
