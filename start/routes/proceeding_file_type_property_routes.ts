import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/proceeding_file_type_property_controller.index')
    router
      .post('/', '#controllers/proceeding_file_type_property_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.storeProceedingFileTypeProperty)
      )
    router
      .post('/create-multiple', '#controllers/proceeding_file_type_property_controller.storeMultiple')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.storeMultipleProceedingFileTypeProperties)
      )
    router.get('/by-proceeding-file-type/:proceedingFileTypeId', '#controllers/proceeding_file_type_property_controller.getByProceedingFileTypeId')
    router
      .delete('/:proceedingFileTypePropertyId', '#controllers/proceeding_file_type_property_controller.delete')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteProceedingFileTypeProperty)
      )
    router.get(
      '/get-categories-by-employee',
      '#controllers/proceeding_file_type_property_controller.getCategories'
    ).use(
      middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getProceedingFileTypePropertyCategoriesByEmployee)
    )
    router.get(
      '/get-categories-by-system-setting',
      '#controllers/proceeding_file_type_property_controller.getCategoriesBySystemSetting'
    )
  })
  .prefix('/api/proceeding-file-type-properties')
  .use(middleware.auth())
  .use(middleware.businessScope())
