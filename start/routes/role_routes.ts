import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS as ROLES } from '#constants/roles_and_permissions_permission_declarations'

router
  .group(() => {
    router
      .post('/assign-batch', '#controllers/role_controller.assignBatch')
      .use(middleware.permissionGate(ROLES.assignRolesPermissionsBatch))
    router
      .post('/assign/:roleId', '#controllers/role_controller.assign')
      .use(middleware.permissionGate(ROLES.assignRolePermissions))
    router
      .get(
        '/has-access-department/:roleId/:departmentId',
        '#controllers/role_controller.hasAccessDepartment'
      )
      .use(middleware.permissionGate(ROLES.hasAccessDepartment))
    // Plomería de sesión del menú y del guard de cada pantalla del backoffice:
    // sin gate. El controller acota `roleId` al rol de la sesión.
    router.get(
      '/has-access/:roleId/:systemModuleSlug/:systemPermissionSlug',
      '#controllers/role_controller.hasAccess'
    )
    router.get('/get-access/:roleId', '#controllers/role_controller.getAccess')
    router.get(
      '/get-access-by-module/:roleId/:systemModuleSlug',
      '#controllers/role_controller.getAccessByModule'
    )
    // Catálogo de roles de los selects y filtros de Usuarios: sin gate.
    router.get('/', '#controllers/role_controller.index')
    router
      .post('/', '#controllers/role_controller.store')
      .use(middleware.permissionGate(ROLES.storeRole))
    router
      .put('/:roleId', '#controllers/role_controller.update')
      .use(middleware.permissionGate(ROLES.updateRole))
    router
      .delete('/:roleId', '#controllers/role_controller.delete')
      .use(middleware.permissionGate(ROLES.destroyRole))
    router
      .get('/:roleId', '#controllers/role_controller.show')
      .use(middleware.permissionGate(ROLES.showRole))
  })
  .prefix('/api/roles')
  .use(middleware.auth())
  .use(middleware.businessScope())
