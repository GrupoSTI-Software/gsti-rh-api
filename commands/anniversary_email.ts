import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import SystemSetting from '#models/system_setting'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'

export default class AnniversaryEmail extends BaseCommand {
  static commandName = 'anniversary:day-email'
  static description = 'Send anniversary emails to employees who are celebrating their work anniversary today'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('🎉 Starting anniversary email process...')

    try {
      this.logger.info('🔍 Checking environment variables...')
      // Obtener la fecha actual
      const today = DateTime.now()
      const currentMonth = today.month
      const currentDay = today.day

      this.logger.info(`📅 Looking for anniversaries on ${currentMonth}/${currentDay}`)

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
        .select('system_setting_id', 'system_setting_business_units', 'system_setting_anniversary_emails')

      let matchingSystemSettingId: number | null = null
      let anniversaryEmailsEnabled = false

      for (const setting of systemSettings) {
        const settingBusinessUnits = setting.systemSettingBusinessUnits.split(',').map((unit: string) => unit.trim())

        // Verificar si hay coincidencia entre las unidades de negocio
        const hasMatch = settingBusinessUnits.some((settingUnit: string) =>
          systemBusinessUnits.includes(settingUnit)
        )

        if (hasMatch) {
          matchingSystemSettingId = setting.systemSettingId
          anniversaryEmailsEnabled = setting.systemSettingAnniversaryEmails === 1
          break
        }
      }

      this.logger.info(`🏢 Using system setting: ${matchingSystemSettingId}`)
      this.logger.info(`📧 Anniversary emails enabled: ${anniversaryEmailsEnabled}`)

      if (!matchingSystemSettingId) {
        this.logger.error('❌ No matching system setting found')
        return
      }

      // Verificar si los emails de aniversario están habilitados para este system setting
      if (!anniversaryEmailsEnabled) {
        this.logger.info('📧 Anniversary emails are disabled for this system setting')
        return
      }

      // Buscar empleados que cumplen aniversario hoy y están activos
      // Solo incluir empleados que tengan al menos 1 año de antigüedad
      const anniversaryEmployees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereNotNull('employee_hire_date')
        .whereNotNull('employee_business_email')
        .whereRaw('MONTH(employee_hire_date) = ?', [currentMonth])
        .whereRaw('DAY(employee_hire_date) = ?', [currentDay])
        .whereRaw('YEAR(employee_hire_date) < ?', [today.year])
        .preload('person')
        .preload('businessUnit')

      this.logger.info(`🎂 Found ${anniversaryEmployees.length} employees celebrating their work anniversary today`)

      if (anniversaryEmployees.length === 0) {
        this.logger.info('📭 No anniversary employees found for today')
        return
      }

      // Enviar emails a cada empleado
      let emailsSent = 0
      let emailsFailed = 0

      for (const employee of anniversaryEmployees) {
        try {
          await this.sendAnniversaryEmail(employee, matchingSystemSettingId)
          emailsSent++
          this.logger.info(`✅ Anniversary email sent to: ${employee.person.personFirstname} ${employee.person.personLastname} (${employee.employeeBusinessEmail})`)
        } catch (error) {
          emailsFailed++
          this.logger.error(`❌ Failed to send email to ${employee.person.personFirstname} ${employee.person.personLastname}: ${error.message}`)
        }
      }

      this.logger.info('📊 Anniversary email process completed:')
      this.logger.info(`   ✅ Emails sent: ${emailsSent}`)
      this.logger.info(`   ❌ Emails failed: ${emailsFailed}`)
      this.logger.info(`   📧 Total processed: ${anniversaryEmployees.length}`)

    } catch (error) {
      this.logger.error(`❌ Error in anniversary email process: ${error.message}`)
    }
  }

  private async sendAnniversaryEmail(employee: Employee, systemSettingId: number) {
    const person = employee.person

    const systemSetting = await SystemSetting.find(systemSettingId)
    if (!systemSetting) {
      this.logger.error('❌ System setting not found')
      return
    }

    // Calcular años de antigüedad
    let yearsOfService = 0
    if (employee.employeeHireDate) {
      const hireDate = employee.employeeHireDate
      const today = DateTime.now()
      yearsOfService = Math.floor(today.diff(hireDate, 'years').years)
    }

    // Crear el HTML del email
    const emailHtml = this.generateAnniversaryEmailHtml(
      person.personFirstname,
      person.personLastname,
      yearsOfService,
      systemSetting!.systemSettingTradeName!,
      systemSetting!.systemSettingSidebarColor!,
      systemSetting!.systemSettingLogo!
    )

    await mail.send((message) => {
      message
        .to(employee.employeeBusinessEmail)
        .subject(`¡Feliz Aniversario! - ${systemSetting!.systemSettingTradeName!}`)
        .html(emailHtml)
    })
  }

  private generateAnniversaryEmailHtml(
    firstName: string,
    lastName: string,
    yearsOfService: number,
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = this.lightenColor(formattedColor, 20)
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>¡Feliz Aniversario!</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
                line-height: 1.6;
            }
            .container {
                max-width: 600px;
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
                text-align: center;
            }
            .logo-container {
                margin-bottom: 20px;
            }
            .logo-container img {
                max-width: 100px;
                max-height: 100px;
                border-radius: 10px;
            }
            .greeting {
                font-size: 24px;
                color: #333;
                margin-bottom: 20px;
                font-weight: 600;
            }
            .years-badge {
                background-color: ${formattedColor};
                color: white;
                padding: 15px 30px;
                border-radius: 50px;
                display: inline-block;
                font-size: 32px;
                font-weight: 700;
                margin: 20px 0;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            }
            .years-label {
                font-size: 14px;
                margin-top: 5px;
                opacity: 0.9;
            }
            .message {
                font-size: 16px;
                color: #666;
                margin-bottom: 30px;
                text-align: left;
                background-color: #f9f9f9;
                padding: 25px;
                border-radius: 8px;
                border-left: 4px solid ${formattedColor};
            }
            .highlight {
                color: ${formattedColor};
                font-weight: 600;
            }
            .footer {
                background-color: #f8f9fa;
                padding: 20px;
                text-align: center;
                color: #666;
                font-size: 14px;
            }
            .business-unit {
                background-color: ${formattedColor};
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                display: inline-block;
                font-size: 12px;
                margin-top: 10px;
            }
            .signature {
                margin-top: 30px;
                font-style: italic;
                color: #888;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>¡Feliz Aniversario!</h1>
                <div class="company-name">${companyName}</div>
            </div>

            <div class="content">
                <div class="logo-container">
                    <img src="${systemLogo}" alt="Logo de ${companyName}">
                </div>

                <div class="greeting">
                    ¡Querido/a <span class="highlight">${firstName} ${lastName}</span>!
                </div>

                <div class="years-badge">
                    ${yearsOfService}
                    <div class="years-label">${yearsOfService === 1 ? 'Año' : 'Años'}</div>
                </div>

                <div class="message">
                    <p>En este día tan especial, queremos tomarnos un momento para celebrar tu <strong>aniversario laboral</strong> y, más importante aún, para <strong>agradecerte</strong> por tu valiosa participación en nuestra empresa.</p>

                    <p>Tu <strong>arduo esfuerzo</strong> y dedicación durante estos ${yearsOfService} ${yearsOfService === 1 ? 'año' : 'años'} no pasan desapercibidos. Cada día contribuyes de manera significativa al crecimiento y éxito de <span class="highlight">${companyName}</span>, y eso es algo que valoramos profundamente.</p>

                    <p>Tu <strong>desempeño excepcional</strong> y tus <strong>competencias profesionales</strong> son un ejemplo para todos nosotros. Has demostrado ser un miembro clave de nuestro equipo, y estamos orgullosos de tenerte como parte de nuestra familia laboral.</p>

                    <p>En este nuevo año de servicio, te deseamos mucho éxito, crecimiento profesional, y que todos tus proyectos se cumplan. <strong>Esperamos seguir trabajando juntos</strong> por muchos años más, construyendo un futuro exitoso para todos.</p>

                    <p>¡Que tengas un día maravilloso lleno de alegría y celebraciones!</p>
                </div>

                <div class="signature">
                    <p>Con cariño y aprecio,<br>
                    <strong>El equipo de ${companyName}</strong></p>
                </div>
            </div>

            <div class="footer">
                <p>Este mensaje fue enviado automáticamente por el sistema de ${companyName}</p>
                <p>© ${new Date().getFullYear()} ${companyName}. Todos los derechos reservados.</p>
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

