import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { REPSE_PANORAMA_PERMISSION_DECLARATIONS } from '#constants/repse_panorama_permission_declarations'

router
  .group(() => {
    router
      .get('/repse/panorama', '#modules/repse-panorama/repse_panorama.controller.index')
      .use(middleware.permissionGate(REPSE_PANORAMA_PERMISSION_DECLARATIONS.showPanorama))
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
