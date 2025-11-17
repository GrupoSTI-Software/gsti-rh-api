import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('/', '#controllers/system_settings_notification_emails_controller.index')
    router.get('/:systemSettingId', '#controllers/system_settings_notification_emails_controller.indexBySystemSetting')
    router.post('/', '#controllers/system_settings_notification_emails_controller.store')
    router.delete(
      '/:systemSettingNotificationEmailId',
      '#controllers/system_settings_notification_emails_controller.delete'
    )
  })
  .prefix('/api/system-settings-notification-emails')
