import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

/**
 * Vacaciones del colaborador dia por dia (ficha del empleado).
 *
 * Leer usa el mismo permiso que `get-vacations-by-period`; cancelar el mismo
 * que borrar un dia (`add-exception`) y, dentro, `manage-vacation`.
 */
router
  .group(() => {
    router
      .get(
        '/:employeeId/vacation-days',
        '#modules/employee-vacations/employee_vacations.controller.index'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacationsByPeriod))
    router
      .post(
        '/:employeeId/vacation-days/:shiftExceptionId/cancel',
        '#modules/employee-vacations/employee_vacations.controller.cancel'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteShiftException))
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
