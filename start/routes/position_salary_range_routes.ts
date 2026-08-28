import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import {
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
} from '#constants/positions_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_salary_range_controller.store')
      .use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange))
    router
      .get('/', '#controllers/position_salary_range_controller.index')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges))
    router
      .get('/current', '#controllers/position_salary_range_controller.current')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange))
    router
      .get('/history', '#controllers/position_salary_range_controller.history')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges))
    router
      .patch('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.update')
      .use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange))
    router
      .get('/:positionSalaryRangeId/audit', '#controllers/position_salary_range_controller.audit')
      .use(middleware.permissionGate(POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange))
    router
      .delete('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.close')
      .use(middleware.permissionGate(POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange))
  })
  .prefix('/api/position-salary-ranges')
  .use(middleware.auth())
  .use(middleware.businessScope())
