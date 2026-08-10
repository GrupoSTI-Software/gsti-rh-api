import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/address_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress))
    router
      .put('/:addressId', '#controllers/address_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateAddress))
  })
  .prefix('/api/address')
  .use(middleware.auth())
router
  .group(() => {
    router.get('/', '#controllers/address_controller.getPlaces')
  })
  .prefix('/api/address-get-places')
  .use(middleware.auth())
