import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { BRANCH_OFFICES_PERMISSION_DECLARATIONS } from '#constants/branch_offices_permission_declarations'

router
  .group(() => {
    router
      .post('/branch-offices', '#controllers/branch_offices_controller.store')
      .use(middleware.permissionGate(BRANCH_OFFICES_PERMISSION_DECLARATIONS.storeBranchOffice))
    // Sin gate: catálogo que usan Empleados, Monitor de asistencia, NOM-035 y
    // REPSE para selects y filtros. Pedir branch-offices:read las rompería.
    router.get('/branch-offices', '#controllers/branch_offices_controller.index')
    router
      .get('/branch-offices/:id', '#controllers/branch_offices_controller.show')
      .use(middleware.permissionGate(BRANCH_OFFICES_PERMISSION_DECLARATIONS.showBranchOffice))
    router
      .put('/branch-offices/:id', '#controllers/branch_offices_controller.update')
      .use(middleware.permissionGate(BRANCH_OFFICES_PERMISSION_DECLARATIONS.updateBranchOffice))
    router
      .delete('/branch-offices/:id', '#controllers/branch_offices_controller.destroy')
      .use(middleware.permissionGate(BRANCH_OFFICES_PERMISSION_DECLARATIONS.destroyBranchOffice))
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
