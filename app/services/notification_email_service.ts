import Employee from '#models/employee'
import SystemSetting from '#models/system_setting'
import SystemSettingNotificationEmail from '#models/system_setting_notification_email'
import ShiftException from '#models/shift_exception'
import ExceptionType from '#models/exception_type'
import mail from '@adonisjs/mail/services/main'
import { DateTime } from 'luxon'
import axios from 'axios'
import env from '#start/env'

/**
 * Service class for sending notification emails when vacation or permission requests are approved
 * Handles business unit filtering and email template generation
 */
export default class NotificationEmailService {
  /**
   * Generates Excel file with permissions for a specific date by calling the existing endpoint
   * @param date - The date to generate the Excel for
   * @param authToken - The authorization token for the request
   * @returns Promise<Buffer | null> - Excel file buffer or null if error
   */
  async generatePermissionsExcel(date: string, authToken?: string): Promise<Buffer | null> {
    try {
      // Hacer petición al endpoint existente que ya funciona
      const baseUrl = env.get('APP_URL', 'http://localhost:3333')
      const endpoint = `${baseUrl}/api/v1/assists/get-excel-permissions-dates`

      const headers: any = {}
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      const response = await axios.get(endpoint, {
        params: {
          date: date,
          'date-end': date
        },
        headers: headers,
        responseType: 'arraybuffer',
        timeout: 30000 // 30 segundos de timeout
      })

      if (response.status === 200 && response.data) {
        return Buffer.from(response.data)
      } else {
        console.error('Failed to generate Excel from endpoint:', response.status)
        return null
      }

    } catch (error) {
      console.error('Error calling Excel endpoint:', error.message)
      return null
    }
  }

  /**
   * Sends notification emails when a vacation or permission is approved
   * @param shiftException - The approved shift exception (vacation or permission)
   * @param authToken - The authorization token for the request
   * @returns Promise<Object> - Result of the notification process
   */
  async sendVacationPermissionNotification(shiftException: ShiftException, authToken?: string) {
    try {
      // Load the employee with business unit information
      const employee = await Employee.query()
        .where('employee_id', shiftException.employeeId)
        .preload('businessUnit')
        .first()

      if (!employee || !employee.businessUnit) {
        return {
          status: 400,
          type: 'warning',
          title: 'Employee or business unit not found',
          message: 'Could not find employee or business unit information',
          data: { employeeId: shiftException.employeeId },
        }
      }

      // Get the business unit slug
      const businessUnitSlug = employee.businessUnit.businessUnitSlug.toLowerCase()

      // Find the system setting that matches this business unit
      const systemSetting = await this.findSystemSettingByBusinessUnit(businessUnitSlug)

      if (!systemSetting) {
        return {
          status: 400,
          type: 'warning',
          title: 'System setting not found',
          message: `No system setting found for business unit: ${businessUnitSlug}`,
          data: { businessUnitSlug },
        }
      }

      // Get notification emails for this system setting
      const notificationEmails = await SystemSettingNotificationEmail.query()
        .whereNull('system_setting_notification_email_deleted_at')
        .where('system_setting_id', systemSetting.systemSettingId)

      if (notificationEmails.length === 0) {
        return {
          status: 400,
          type: 'warning',
          title: 'No notification emails configured',
          message: `No notification emails configured for system setting: ${systemSetting.systemSettingTradeName}`,
          data: { systemSettingId: systemSetting.systemSettingId },
        }
      }

      // Load exception type information
      const exceptionType = await ExceptionType.query()
        .whereNull('exception_type_deleted_at')
        .where('exception_type_id', shiftException.exceptionTypeId)
        .first()

      // Prepare email data
      const emailData = {
        employee: {
          name: `${employee.employeeFirstName} ${employee.employeeLastName}`,
          code: employee.employeeCode,
          businessUnit: employee.businessUnit.businessUnitName,
          department: employee.department?.departmentName || 'N/A',
          position: employee.position?.positionName || 'N/A',
        },
        exception: {
          type: exceptionType?.exceptionTypeTypeName || 'Unknown',
          slug: exceptionType?.exceptionTypeSlug || 'unknown',
          description: shiftException.shiftExceptionsDescription || 'No description provided',
          date: DateTime.fromJSDate(new Date(shiftException.shiftExceptionsDate)).toFormat('dd/MM/yyyy'),
          checkInTime: shiftException.shiftExceptionCheckInTime || 'N/A',
          checkOutTime: shiftException.shiftExceptionCheckOutTime || 'N/A',
          isVacation: exceptionType?.exceptionTypeSlug === 'vacation',
          isAbsence: exceptionType?.exceptionTypeSlug === 'absence-from-work',
          isEarlyDeparture: exceptionType?.exceptionTypeSlug === 'early-departure',
          isLateArrival: exceptionType?.exceptionTypeSlug === 'late-arrival',
          isOvertime: exceptionType?.exceptionTypeSlug === 'overtime',
        },
        systemSetting: {
          tradeName: systemSetting.systemSettingTradeName,
          logo: systemSetting.systemSettingLogo,
          sidebarColor: systemSetting.systemSettingSidebarColor,
        },
      }

      // Generate Excel file for the date
      const exceptionDate = DateTime.fromJSDate(new Date(shiftException.shiftExceptionsDate)).toFormat('yyyy-MM-dd')
      const excelBuffer = await this.generatePermissionsExcel(exceptionDate, authToken)

      // Send emails to all notification recipients
      const emailResults = []
      for (const notificationEmail of notificationEmails) {
        try {
          await mail.send((message) => {
            message
              .to(notificationEmail.email)
              .subject(`Notificación de Ausencia - ${emailData.employee.name}`)
              .htmlView('emails/vacation_permission_notification', emailData)

            // Attach Excel file if generated successfully
            if (excelBuffer) {
              message.attachData(excelBuffer, {
                filename: `permisos-${exceptionDate}.xlsx`,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              })
            }
          })

          emailResults.push({
            email: notificationEmail.email,
            status: 'sent',
            message: 'Email sent successfully',
            excelAttached: !!excelBuffer,
          })
        } catch (emailError) {
          console.error(`Error sending email to ${notificationEmail.email}:`, emailError)
          emailResults.push({
            email: notificationEmail.email,
            status: 'failed',
            message: emailError.message,
            error: emailError.code || 'UNKNOWN_ERROR',
          })
        }
      }

      return {
        status: 200,
        type: 'success',
        title: 'Notification emails processed',
        message: `Notification emails processed for ${emailResults.length} recipients`,
        data: {
          systemSetting: systemSetting.systemSettingTradeName,
          businessUnit: businessUnitSlug,
          emailResults,
        },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Error sending notification emails',
        message: 'An unexpected error occurred while sending notification emails',
        error: error.message,
      }
    }
  }

  /**
   * Finds a system setting that matches the given business unit slug
   * @param businessUnitSlug - The business unit slug to match
   * @returns Promise<SystemSetting | null> - The matching system setting or null
   */
  private async findSystemSettingByBusinessUnit(businessUnitSlug: string): Promise<SystemSetting | null> {
    const systemSettings = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)

    for (const systemSetting of systemSettings) {
      if (systemSetting.systemSettingBusinessUnits) {
        // Split the business units string and convert to lowercase
        const businessUnits = systemSetting.systemSettingBusinessUnits
          .split(',')
          .map(unit => unit.trim().toLowerCase())

        // Check if the business unit slug matches any of the configured units
        if (businessUnits.includes(businessUnitSlug)) {
          return systemSetting
        }
      }
    }

    return null
  }

  /**
   * Sends notification emails when an exception request is approved
   * @param exceptionRequest - The approved exception request
   * @param authToken - The authorization token for the request
   * @returns Promise<Object> - Result of the notification process
   */
  async sendExceptionRequestNotification(exceptionRequest: any, authToken?: string) {
    try {
      // Load the employee with business unit information
      const employee = await Employee.query()
        .where('employee_id', exceptionRequest.employeeId)
        .preload('businessUnit')
        .preload('department')
        .preload('position')
        .first()

      if (!employee || !employee.businessUnit) {
        return {
          status: 400,
          type: 'warning',
          title: 'Employee or business unit not found',
          message: 'Could not find employee or business unit information',
          data: { employeeId: exceptionRequest.employeeId },
        }
      }

      // Get the business unit slug
      const businessUnitSlug = employee.businessUnit.businessUnitSlug.toLowerCase()

      // Find the system setting that matches this business unit
      const systemSetting = await this.findSystemSettingByBusinessUnit(businessUnitSlug)

      if (!systemSetting) {
        return {
          status: 400,
          type: 'warning',
          title: 'System setting not found',
          message: `No system setting found for business unit: ${businessUnitSlug}`,
          data: { businessUnitSlug },
        }
      }

      // Get notification emails for this system setting
      const notificationEmails = await SystemSettingNotificationEmail.query()
        .whereNull('system_setting_notification_email_deleted_at')
        .where('system_setting_id', systemSetting.systemSettingId)

      if (notificationEmails.length === 0) {
        return {
          status: 400,
          type: 'warning',
          title: 'No notification emails configured',
          message: `No notification emails configured for system setting: ${systemSetting.systemSettingTradeName}`,
          data: { systemSettingId: systemSetting.systemSettingId },
        }
      }

      // Load exception type information
      const exceptionType = await ExceptionType.query()
        .whereNull('exception_type_deleted_at')
        .where('exception_type_id', exceptionRequest.exceptionTypeId)
        .first()

      // Prepare email data
      const emailData = {
        employee: {
          name: `${employee.employeeFirstName} ${employee.employeeLastName}`,
          code: employee.employeeCode,
          businessUnit: employee.businessUnit.businessUnitName,
          department: employee.department?.departmentName || 'N/A',
          position: employee.position?.positionName || 'N/A',
        },
        exception: {
          type: exceptionType?.exceptionTypeTypeName || 'Unknown',
          slug: exceptionType?.exceptionTypeSlug || 'unknown',
          description: exceptionRequest.exceptionRequestDescription || 'No description provided',
          date: DateTime.fromJSDate(new Date(exceptionRequest.requestedDate)).toFormat('dd/MM/yyyy'),
          checkInTime: exceptionRequest.exceptionRequestCheckInTime || 'N/A',
          checkOutTime: exceptionRequest.exceptionRequestCheckOutTime || 'N/A',
          isVacation: exceptionType?.exceptionTypeSlug === 'vacation',
          isAbsence: exceptionType?.exceptionTypeSlug === 'absence-from-work',
          isEarlyDeparture: exceptionType?.exceptionTypeSlug === 'early-departure',
          isLateArrival: exceptionType?.exceptionTypeSlug === 'late-arrival',
          isOvertime: exceptionType?.exceptionTypeSlug === 'overtime',
        },
        systemSetting: {
          tradeName: systemSetting.systemSettingTradeName,
          logo: systemSetting.systemSettingLogo,
          sidebarColor: systemSetting.systemSettingSidebarColor,
        },
      }

      // Generate Excel file for the date
      const exceptionDate = DateTime.fromJSDate(new Date(exceptionRequest.requestedDate)).toFormat('yyyy-MM-dd')
      const excelBuffer = await this.generatePermissionsExcel(exceptionDate, authToken)

      // Send emails to all notification recipients
      const emailResults = []
      for (const notificationEmail of notificationEmails) {
        try {
          await mail.send((message) => {
            message
              .to(notificationEmail.email)
              .subject(`Notificación de Ausencia - ${emailData.employee.name}`)
              .htmlView('emails/vacation_permission_notification', emailData)

            // Attach Excel file if generated successfully
            if (excelBuffer) {
              message.attachData(excelBuffer, {
                filename: `permisos-${exceptionDate}.xlsx`,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              })
            }
          })

          emailResults.push({
            email: notificationEmail.email,
            status: 'sent',
            message: 'Email sent successfully',
            excelAttached: !!excelBuffer,
          })
        } catch (emailError) {
          console.error(`Error sending email to ${notificationEmail.email}:`, emailError)
          emailResults.push({
            email: notificationEmail.email,
            status: 'failed',
            message: emailError.message,
            error: emailError.code || 'UNKNOWN_ERROR',
          })
        }
      }

      return {
        status: 200,
        type: 'success',
        title: 'Notification emails processed',
        message: `Notification emails processed for ${emailResults.length} recipients`,
        data: {
          systemSetting: systemSetting.systemSettingTradeName,
          businessUnit: businessUnitSlug,
          emailResults,
        },
      }
    } catch (error) {
      return {
        status: 500,
        type: 'error',
        title: 'Error sending notification emails',
        message: 'An unexpected error occurred while sending notification emails',
        error: error.message,
      }
    }
  }
}
