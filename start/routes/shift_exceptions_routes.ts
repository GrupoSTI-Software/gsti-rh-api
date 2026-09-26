import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/shift-exception-apply-general', '#controllers/shift_exceptions_controller.applyExceptionGeneral')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.applyExceptionMass))
    router
      .post('/shift-exception', '#controllers/shift_exceptions_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createShiftException))
    router
      .get('/shift-exception', '#controllers/shift_exceptions_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexShiftExceptions))
    router
      .get('/shift-exception/:id', '#controllers/shift_exceptions_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showShiftException))
    router
      .put('/shift-exception/:id', '#controllers/shift_exceptions_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateShiftException))
    router
      .delete('/shift-exception/:id', '#controllers/shift_exceptions_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteShiftException))
    router
      .get(
        '/shift-exception-employee/:employeeId',
        '#controllers/shift_exceptions_controller.getByEmployee'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getShiftExceptionsByEmployee)
      )
    router
      .get(
        'shift-exception/:shiftExceptionId/evidences',
        '#controllers/shift_exceptions_controller.getEvidences'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getShiftExceptionEvidences)
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
