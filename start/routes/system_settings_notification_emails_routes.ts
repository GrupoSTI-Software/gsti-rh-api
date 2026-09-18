import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

/**
 * Destinatarios de las notificaciones internas de la empresa.
 *
 * El grupo no montaba ningún middleware: sin sesión se listaban, creaban y
 * borraban destinatarios. `auth()` va en el grupo para que ninguna ruta que se
 * agregue aquí nazca pública, y cada ruta declara su permiso. El gate no
 * sustituye a `auth()`: si alguien apagara la exigencia de `system-settings` en
 * BD —hoy encendida—, dejaría pasar sin mirar al usuario.
 */
router
  .group(() => {
    router
      .get('/', '#controllers/system_settings_notification_emails_controller.index')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.indexNotificationEmails))
    router
      .get(
        '/:systemSettingId',
        '#controllers/system_settings_notification_emails_controller.indexBySystemSetting'
      )
      .use(
        middleware.permissionGate(
          SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.indexNotificationEmailsBySystemSetting
        )
      )
    router
      .post('/', '#controllers/system_settings_notification_emails_controller.store')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeNotificationEmail))
    router
      .delete(
        '/:systemSettingNotificationEmailId',
        '#controllers/system_settings_notification_emails_controller.delete'
      )
      .use(
        middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyNotificationEmail)
      )
  })
  .prefix('/api/system-settings-notification-emails')
  .use(middleware.auth())
  /**
   * Sin `businessScope()` no hay contexto de empresa y el servicio no puede
   * acotar sus consultas: el `systemSettingId` llega del cliente. Antes de
   * montarlo, el listado devolvía los correos de todas las empresas y el alta
   * permitía suscribirse a las notificaciones de otro cliente.
   */
  .use(middleware.businessScope())
