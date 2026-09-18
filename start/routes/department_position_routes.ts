import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/department_position_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storeDepartmentPosition))
    router
      .put('/:departmentPositionId', '#controllers/department_position_controller.update')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updateDepartmentPosition))
    router
      .delete('/:departmentPositionId', '#controllers/department_position_controller.delete')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deleteDepartmentPosition))
    router
      .delete('/:departmentId/:positionId', '#controllers/department_position_controller.deleteRelation')
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deleteDepartmentPositionRelation
        )
      )
    router
      .get('/:departmentPositionId', '#controllers/department_position_controller.show')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.showDepartmentPosition))
  })
  .prefix('/api/departments-positions')
  .use(middleware.auth())
  .use(middleware.businessScope())
