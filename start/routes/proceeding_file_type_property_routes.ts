import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/proceeding_file_type_property_controller.index')
    router.post('/', '#controllers/proceeding_file_type_property_controller.store')
    router.post('/create-multiple', '#controllers/proceeding_file_type_property_controller.storeMultiple')
    router.get('/by-proceeding-file-type/:proceedingFileTypeId', '#controllers/proceeding_file_type_property_controller.getByProceedingFileTypeId')
    router.delete('/:proceedingFileTypePropertyId', '#controllers/proceeding_file_type_property_controller.delete')
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
