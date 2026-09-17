import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS as ROLES } from '#constants/roles_and_permissions_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/role_preset_controller.index')
      .use(middleware.permissionGate(ROLES.indexRolePresets))
  })
  .prefix('/api/role-presets')
  .use([middleware.auth(), middleware.businessScope()])

router
  .group(() => {
    router
      .post('/role-presets/preview', '#controllers/role_preset_controller.preview')
      .use(middleware.permissionGate(ROLES.previewRolePreset))
    router
      .post('/role-presets/apply', '#controllers/role_preset_controller.apply')
      .use(middleware.permissionGate(ROLES.applyRolePreset))
  })
  .prefix('/api/roles/:roleId')
  .use([middleware.auth(), middleware.businessScope()])
