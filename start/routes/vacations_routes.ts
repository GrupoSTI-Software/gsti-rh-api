import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { VACATIONS_PERMISSION_DECLARATIONS } from '#constants/vacations_permission_declarations'

router
  .group(() => {
    // Lecturas sin gate: la política de vacaciones del expediente del empleado
    // lee la tabla (ver vacations_permission_declarations.ts).
    router.get('/', '#controllers/vacation_settings_controller.index')
    router
      .post('/', '#controllers/vacation_settings_controller.store')
      .use(middleware.permissionGate(VACATIONS_PERMISSION_DECLARATIONS.storeVacationSetting))
    router
      .put('/:vacationSettingId', '#controllers/vacation_settings_controller.update')
      .use(middleware.permissionGate(VACATIONS_PERMISSION_DECLARATIONS.updateVacationSetting))
    router
      .delete('/:vacationSettingId', '#controllers/vacation_settings_controller.destroy')
      .use(middleware.permissionGate(VACATIONS_PERMISSION_DECLARATIONS.destroyVacationSetting))
    router.get('/:vacationSettingId', '#controllers/vacation_settings_controller.show')
  })
  .prefix('/api/vacations')
  .use(middleware.auth())
