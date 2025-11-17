import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'

export default class BirthdayReminderEmail extends BaseCommand {
  static commandName = 'birthday:reminder-email'
  static description = 'Send birthday reminder emails to HR users about employees celebrating their birthday today'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('🎉 Starting birthday reminder email process...')

    try {
      this.logger.info('🔍 Checking environment variables...')
      // Obtener la fecha actual
      const today = DateTime.now()
      const currentMonth = today.month
      const currentDay = today.day

      this.logger.info(`📅 Looking for birthdays on ${currentMonth}/${currentDay}`)

      // Obtener la variable de entorno SYSTEM_BUSINESS
      const systemBusinessEnv = env.get('SYSTEM_BUSINESS', '')
      this.logger.info(`🔧 SYSTEM_BUSINESS value: "${systemBusinessEnv}"`)
      if (!systemBusinessEnv) {
        this.logger.error('❌ SYSTEM_BUSINESS environment variable not found')
        return
      }

      // Convertir la variable de entorno a array de strings
      const systemBusinessUnits = systemBusinessEnv.split(',').map((unit: string) => unit.trim())
      this.logger.info(`🔧 Environment business units: [${systemBusinessUnits.join(', ')}]`)

      const systemSettings = await SystemSetting.query()
        .where('system_setting_active', 1)
        .select('system_setting_id', 'system_setting_business_units', 'system_setting_birthday_emails')

      let matchingSystemSettingId: number | null = null
      let birthdayEmailsEnabled = false

      for (const setting of systemSettings) {
        const settingBusinessUnits = setting.systemSettingBusinessUnits.split(',').map((unit: string) => unit.trim())

        // Verificar si hay coincidencia entre las unidades de negocio
        const hasMatch = settingBusinessUnits.some((settingUnit: string) =>
          systemBusinessUnits.includes(settingUnit)
        )

        if (hasMatch) {
          matchingSystemSettingId = setting.systemSettingId
          birthdayEmailsEnabled = setting.systemSettingBirthdayEmails === 1
          break
        }
      }

      this.logger.info(`🏢 Using system setting: ${matchingSystemSettingId}`)
      this.logger.info(`📧 Birthday emails enabled: ${birthdayEmailsEnabled}`)

      if (!matchingSystemSettingId) {
        this.logger.error('❌ No matching system setting found')
        return
      }

      // Obtener el system setting para obtener el business access
      const systemSetting = await SystemSetting.find(matchingSystemSettingId)
      if (!systemSetting) {
        this.logger.error('❌ System setting not found')
        return
      }

      const systemSettingBusinessAccess = systemSetting.systemSettingBusinessUnits
      const systemSettingBusinessAccessArray = systemSettingBusinessAccess.split(',').map((unit: string) => unit.trim())
      this.logger.info(`🏢 System setting business access: "${systemSettingBusinessAccess}"`)
      this.logger.info(`🏢 System setting business access array: [${systemSettingBusinessAccessArray.join(', ')}]`)
      this.logger.info(`🔍 Filtering employees by business units: [${systemBusinessUnits.join(', ')}]`)

      // Buscar empleados que cumplen años hoy y están activos, filtrados por business access
      const birthdayEmployees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereHas('person', (personQuery) => {
          personQuery.whereNotNull('person_birthday')
            .whereRaw('MONTH(person_birthday) = ?', [currentMonth])
            .whereRaw('DAY(person_birthday) = ?', [currentDay])
        })
        .whereHas('businessUnit', (businessUnitQuery) => {
          businessUnitQuery.whereIn('business_unit_slug', systemBusinessUnits)
        })
        .preload('person')
        .preload('businessUnit')
        .preload('department')
        .preload('position')

      this.logger.info(`🎂 Found ${birthdayEmployees.length} employees celebrating their birthday today (filtered by business access)`)

      if (birthdayEmployees.length === 0) {
        this.logger.info('📭 No birthday employees found for today in the current business units')
        return
      }

      // Buscar usuarios con rol de RH que tengan el business access correcto
      this.logger.info(`🔍 Filtering HR users by business access: [${systemSettingBusinessAccessArray.join(', ')}]`)
      const hrUsers = await User.query()
        .whereNull('user_deleted_at')
        .where('user_active', 1)
        .whereHas('role', (roleQuery) => {
          roleQuery.where('role_slug', 'rh-manager')
            .whereIn('role_business_access', systemSettingBusinessAccessArray)
        })
        .preload('person')
        .preload('role')

      this.logger.info(`👥 Found ${hrUsers.length} HR users to notify (filtered by business access)`)

      if (hrUsers.length === 0) {
        this.logger.info('📭 No HR users found to notify with the current business access')
        return
      }

      // El systemSetting ya se obtuvo anteriormente

      // Enviar emails de recordatorio a cada usuario de RH
      let emailsSent = 0
      let emailsFailed = 0

      for (const hrUser of hrUsers) {
        try {
          await this.sendBirthdayReminderEmail(hrUser, birthdayEmployees, systemSetting)
          emailsSent++
          this.logger.info(`✅ Birthday reminder email sent to: ${hrUser.person.personFirstname} ${hrUser.person.personLastname} (${hrUser.person.personEmail})`)
        } catch (error) {
          emailsFailed++
          this.logger.error(`❌ Failed to send reminder email to ${hrUser.person.personFirstname} ${hrUser.person.personLastname}: ${error.message}`)
        }
      }

      this.logger.info('📊 Birthday reminder email process completed:')
      this.logger.info(`   ✅ Emails sent: ${emailsSent}`)
      this.logger.info(`   ❌ Emails failed: ${emailsFailed}`)
      this.logger.info(`   👥 HR users notified: ${hrUsers.length}`)
      this.logger.info(`   🎂 Birthday employees: ${birthdayEmployees.length}`)

    } catch (error) {
      this.logger.error(`❌ Error in birthday reminder email process: ${error.message}`)
    }
  }

  private async sendBirthdayReminderEmail(hrUser: User, birthdayEmployees: Employee[], systemSetting: SystemSetting) {
    const person = hrUser.person

    // Crear el HTML del email
    const emailHtml = this.generateBirthdayReminderEmailHtml(
      person.personFirstname,
      person.personLastname,
      birthdayEmployees,
      systemSetting.systemSettingTradeName!,
      systemSetting.systemSettingSidebarColor!,
      systemSetting.systemSettingLogo!
    )

    await mail.send((message) => {
      message
        .to(hrUser.userEmail)
        .subject(`🎂 Recordatorio: Empleados que cumplen años hoy - ${systemSetting.systemSettingTradeName!}`)
        .html(emailHtml)
    })
  }

  private generateBirthdayReminderEmailHtml(
    hrFirstName: string,
    hrLastName: string,
    birthdayEmployees: Employee[],
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = this.lightenColor(formattedColor, 20)

    // Generar la lista de empleados que cumplen años
    const employeesList = birthdayEmployees.map(employee => {
      const person = employee.person
      const department = employee.department?.departmentName || 'N/A'
      const position = employee.position?.positionName || 'N/A'

      // Calcular la edad que está cumpliendo
      const today = DateTime.now()
      let age = 0

      try {
        // Intentar diferentes formatos de fecha
        let birthday: DateTime

        if (person.personBirthday && typeof person.personBirthday === 'object' && 'getTime' in person.personBirthday) {
          birthday = DateTime.fromJSDate(person.personBirthday as Date)
        } else if (typeof person.personBirthday === 'string') {
          // Intentar parsear como ISO o formato de fecha
          birthday = DateTime.fromISO(person.personBirthday) || DateTime.fromJSDate(new Date(person.personBirthday))
        } else {
          birthday = DateTime.fromJSDate(new Date(person.personBirthday || ''))
        }

        if (birthday.isValid) {
          age = today.diff(birthday, 'years').years
        } else {
          // Fallback: calcular manualmente
          const birthDate = new Date(person.personBirthday || '')
          const todayDate = new Date()
          age = todayDate.getFullYear() - birthDate.getFullYear()
          const monthDiff = todayDate.getMonth() - birthDate.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && todayDate.getDate() < birthDate.getDate())) {
            age--
          }
        }
      } catch (error) {
        console.error('Error calculating age:', error)
        age = 0
      }

      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; text-align: left;">
            <strong>${person.personFirstname} ${person.personLastname}</strong>
          </td>
          <td style="padding: 12px; text-align: left;">${department}</td>
          <td style="padding: 12px; text-align: left;">${position}</td>
          <td style="padding: 12px; text-align: center; vertical-align: middle;">
            <div style="display: inline-block; background-color: ${formattedColor}; color: white; padding: 6px 12px; border-radius: 15px; font-weight: 600; font-size: 13px; min-width: 60px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              ${age > 0 ? Math.floor(age) : 'N/A'}
            </div>
          </td>
          <td style="padding: 12px; text-align: left;">
            <a href="mailto:${person.personEmail}" style="color: ${formattedColor}; text-decoration: none;">
              ${person.personEmail}
            </a>
          </td>
        </tr>
      `
    }).join('')

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recordatorio de Cumpleaños</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
                line-height: 1.6;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                background: linear-gradient(135deg, ${formattedColor}, ${lightColor});
                color: white;
                padding: 30px 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 300;
            }
            .logo {
                max-width: 80px;
                max-height: 80px;
                margin-bottom: 15px;
                border-radius: 8px;
            }
            .header .company-name {
                font-size: 18px;
                margin-top: 10px;
                opacity: 0.9;
            }
            .content {
                padding: 40px 30px;
                text-align: left;
            }
            .logo-container {
                text-align: center;
                margin-bottom: 20px;
            }
            .logo-container img {
                max-width: 100px;
                max-height: 100px;
                border-radius: 10px;
            }
            .greeting {
                font-size: 20px;
                color: #333;
                margin-bottom: 20px;
                font-weight: 600;
            }
            .message {
                font-size: 16px;
                color: #666;
                margin-bottom: 30px;
                background-color: #f9f9f9;
                padding: 25px;
                border-radius: 8px;
                border-left: 4px solid ${formattedColor};
            }
            .highlight {
                color: ${formattedColor};
                font-weight: 600;
            }
            .employees-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                background-color: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .employees-table th {
                background-color: ${formattedColor};
                color: white;
                padding: 15px 12px;
                text-align: left;
                font-weight: 600;
                font-size: 14px;
            }
            .employees-table th:nth-child(4) {
                text-align: center;
            }
            .employees-table td {
                padding: 12px;
                border-bottom: 1px solid #eee;
                font-size: 14px;
            }
            .employees-table tr:hover {
                background-color: #f8f9fa;
            }
            .summary {
                background-color: #e8f4fd;
                border: 1px solid #bee5eb;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                text-align: center;
            }
            .summary h3 {
                margin: 0 0 10px 0;
                color: ${formattedColor};
                font-size: 18px;
            }
            .summary p {
                margin: 5px 0;
                font-size: 16px;
                color: #333;
            }
            .footer {
                background-color: #f8f9fa;
                padding: 20px;
                text-align: center;
                color: #666;
                font-size: 14px;
            }
            .signature {
                margin-top: 30px;
                font-style: italic;
                color: #888;
                text-align: center;
            }
            .action-note {
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                color: #856404;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎂 Recordatorio de Cumpleaños</h1>
                <div class="company-name">${companyName}</div>
            </div>

            <div class="content">
                <div class="logo-container">
                    <img src="${systemLogo}" alt="Logo de ${companyName}">
                </div>

                <div class="greeting">
                    Hola <span class="highlight">${hrFirstName} ${hrLastName}</span>,
                </div>

                <div class="message">
                    <p>Este es un recordatorio automático para informarte que <strong>${birthdayEmployees.length} empleado(s)</strong> están celebrando su cumpleaños hoy.</p>

                    <p>Como miembro del equipo de <strong>Recursos Humanos</strong>, te recomendamos considerar enviarles un mensaje de felicitación o coordinar alguna celebración especial para hacer que este día sea memorable para ellos.</p>
                </div>

                <div class="summary">
                    <h3>📊 Resumen del Día</h3>
                    <p><strong>Fecha:</strong> ${DateTime.now().toFormat('dd/MM/yyyy')}</p>
                    <p><strong>Total de cumpleañeros:</strong> ${birthdayEmployees.length}</p>
                </div>

                <div class="action-note">
                    <strong>💡 Sugerencia:</strong> Considera enviar un mensaje personalizado o coordinar una pequeña celebración para estos empleados.
                </div>

                <h3 style="color: ${formattedColor}; margin-top: 30px;">👥 Empleados que cumplen años hoy:</h3>

                <table class="employees-table">
                    <thead>
                        <tr>
                            <th>Nombre Completo</th>
                            <th>Departamento</th>
                            <th>Posición</th>
                            <th style="text-align: center;">Edad</th>
                            <th>Email Personal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employeesList}
                    </tbody>
                </table>

                <div class="signature">
                    <p>Este mensaje fue generado automáticamente por el sistema de ${companyName}</p>
                    <p><strong>Equipo de Sistemas</strong></p>
                </div>
            </div>

            <div class="footer">
                <p>© ${new Date().getFullYear()} ${companyName}. Todos los derechos reservados.</p>
                <p>Este es un mensaje automático del sistema de gestión de empleados.</p>
            </div>
        </div>
    </body>
    </html>
    `
  }

  private lightenColor(color: string, percent: number): string {
    // Función para aclarar un color hexadecimal
    const num = Number.parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = (num >> 16) + amt
    const G = (num >> 8 & 0x00FF) + amt
    const B = (num & 0x0000FF) + amt
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)
  }
}
