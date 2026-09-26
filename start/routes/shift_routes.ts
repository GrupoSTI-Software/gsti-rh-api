/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SHIFTS_PERMISSION_DECLARATIONS } from '#constants/shifts_permission_declarations'

router
  .group(() => {
    router
      .post('/shift', '#controllers/shifts_controller.store')
      .use(middleware.permissionGate(SHIFTS_PERMISSION_DECLARATIONS.storeShift))
    // Sin gate: catálogo que usan la asignación y el cambio de turno en
    // Empleados y las cuotas de REPSE. Pedir shifts:read los rompería.
    router.get('/shift', '#controllers/shifts_controller.index')
    // Sin gate: el cambio de turno del colaborador (Empleados) relee aquí el
    // turno destino.
    router.get('/shift/:id', '#controllers/shifts_controller.show')
    router
      .put('/shift/:id', '#controllers/shifts_controller.update')
      .use(middleware.permissionGate(SHIFTS_PERMISSION_DECLARATIONS.updateShift))
    router
      .delete('/shift/:id', '#controllers/shifts_controller.destroy')
      .use(middleware.permissionGate(SHIFTS_PERMISSION_DECLARATIONS.destroyShift))
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
