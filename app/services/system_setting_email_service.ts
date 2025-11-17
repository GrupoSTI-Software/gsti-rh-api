import SystemSetting from '#models/system_setting'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'

/**
 * Service class for managing system setting notification emails
 * Provides methods to create, delete, and verify system setting notification email records
 */
export default class SystemSettingEmailService {
  /**
   * Retrieves all system setting notification emails
   * @returns Promise<SystemSettingNotificationEmail[]> - Array of notification email records
   */
  async index() {
    const systemSettingNotificationEmails = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .preload('systemSetting')
      .orderBy('system_setting_notification_email_id', 'desc')
    return systemSettingNotificationEmails
  }

  /**
   * Retrieves system setting notification emails by system setting ID
   * @param systemSettingId - The system setting ID to filter by
   * @returns Promise<SystemSettingNotificationEmail[]> - Array of notification email records for the specified system setting
   */
  async indexBySystemSetting(systemSettingId: number) {
    const systemSettingNotificationEmails = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .where('system_setting_id', systemSettingId)
      .preload('systemSetting')
      .orderBy('system_setting_notification_email_id', 'desc')
    return systemSettingNotificationEmails
  }

  /**
   * Creates a new system setting notification email record
   * @param systemSettingNotificationEmail - The notification email object to create
   * @returns Promise<SystemSettingNotificationEmail> - The created notification email record
   */
  async create(systemSettingNotificationEmail: SystemSettingNotificationEmail) {
    const newSystemSettingNotificationEmail = new SystemSettingNotificationEmail()
    newSystemSettingNotificationEmail.systemSettingId = systemSettingNotificationEmail.systemSettingId
    newSystemSettingNotificationEmail.email = systemSettingNotificationEmail.email
    await newSystemSettingNotificationEmail.save()
    return newSystemSettingNotificationEmail
  }

  /**
   * Deletes a system setting notification email record (soft delete)
   * @param currentSystemSettingNotificationEmail - The notification email record to delete
   * @returns Promise<SystemSettingNotificationEmail> - The deleted notification email record
   */
  async delete(currentSystemSettingNotificationEmail: SystemSettingNotificationEmail) {
    await currentSystemSettingNotificationEmail.delete()
    return currentSystemSettingNotificationEmail
  }

  /**
   * Retrieves a system setting notification email by ID
   * @param systemSettingNotificationEmailId - The ID of the notification email to retrieve
   * @returns Promise<SystemSettingNotificationEmail | null> - The notification email record or null if not found
   */
  async show(systemSettingNotificationEmailId: number) {
    const systemSettingNotificationEmail = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .where('system_setting_notification_email_id', systemSettingNotificationEmailId)
      .first()
    return systemSettingNotificationEmail ? systemSettingNotificationEmail : null
  }

  /**
   * Verifies if the system setting exists for the notification email
   * @param systemSettingNotificationEmail - The notification email object to verify
   * @returns Promise<Object> - Verification result with status and message
   */
  async verifyInfoExist(systemSettingNotificationEmail: SystemSettingNotificationEmail) {
    const existSystemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingNotificationEmail.systemSettingId)
      .first()

    if (!existSystemSetting && systemSettingNotificationEmail.systemSettingId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The system setting was not found',
        message: 'The system setting was not found with the entered ID',
        data: { ...systemSettingNotificationEmail },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...systemSettingNotificationEmail },
    }
  }

  /**
   * Verifies if the notification email already exists for the system setting
   * @param systemSettingNotificationEmail - The notification email object to verify
   * @returns Promise<Object> - Verification result with status and message
   */
  async verifyInfo(systemSettingNotificationEmail: SystemSettingNotificationEmail) {
    const action = systemSettingNotificationEmail.systemSettingNotificationEmailId > 0 ? 'updated' : 'created'
    const existSystemSettingNotificationEmail = await SystemSettingNotificationEmail.query()
      .whereNull('system_setting_notification_email_deleted_at')
      .if(systemSettingNotificationEmail.systemSettingNotificationEmailId > 0, (query) => {
        query.whereNot(
          'system_setting_notification_email_id',
          systemSettingNotificationEmail.systemSettingNotificationEmailId
        )
      })
      .where('system_setting_id', systemSettingNotificationEmail.systemSettingId)
      .where('email', systemSettingNotificationEmail.email)
      .first()

    if (existSystemSettingNotificationEmail) {
      return {
        status: 400,
        type: 'warning',
        title: 'The notification email already exists for this system setting',
        message: `The notification email resource cannot be ${action} because the email is already assigned to this system setting`,
        data: { ...systemSettingNotificationEmail },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...systemSettingNotificationEmail },
    }
  }
}
