import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/proceeding_file_type_property_value_controller.store')
    router.put(
      '/:proceedingFileTypePropertyValueId',
      '#controllers/proceeding_file_type_property_value_controller.update'
    )
    router.delete(
      '/:proceedingFileTypePropertyValueId',
      '#controllers/proceeding_file_type_property_value_controller.delete'
    )
    router.get(
      '/:proceedingFileTypePropertyValueId',
      '#controllers/proceeding_file_type_property_value_controller.show'
    )
  })
  .prefix('/api/proceeding-file-type-property-values')
  .use(middleware.auth())
  .use(middleware.businessScope())
