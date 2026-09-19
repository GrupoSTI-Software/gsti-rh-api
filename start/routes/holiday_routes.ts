import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { CALENDAR_PERMISSION_DECLARATIONS } from '#constants/calendar_permission_declarations'

router
  .group(() => {
    router
      .post('/holidays', '#controllers/holidays_controller.store')
      .use(middleware.permissionGate(CALENDAR_PERMISSION_DECLARATIONS.storeHoliday))
    // Sin gate: la lista la leen la PWA del colaborador y los cálculos de asistencia y nómina.
    router.get('/holidays', '#controllers/holidays_controller.index')
    // Antes de `/:id` para que "export-excel" no se lea como identificador.
    router
      .get('/holidays/export-excel', '#controllers/holidays_controller.exportExcel')
      .use(middleware.permissionGate(CALENDAR_PERMISSION_DECLARATIONS.exportHolidaysExcel))
    router
      .get('/holidays/:id', '#controllers/holidays_controller.show')
      .use(middleware.permissionGate(CALENDAR_PERMISSION_DECLARATIONS.showHoliday))
    router
      .put('/holidays/:id', '#controllers/holidays_controller.update')
      .use(middleware.permissionGate(CALENDAR_PERMISSION_DECLARATIONS.updateHoliday))
    router
      .delete('/holidays/:id', '#controllers/holidays_controller.destroy')
      .use(middleware.permissionGate(CALENDAR_PERMISSION_DECLARATIONS.destroyHoliday))
    router.get('/icons', '#controllers/icons_controller.index')
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
