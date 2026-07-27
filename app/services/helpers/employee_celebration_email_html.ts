import { DateTime } from 'luxon'
import Employee from '#models/employee'

function lightenColor(color: string, percent: number): string {
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

export function generateBirthdayEmailHtml(
    firstName: string,
    lastName: string,
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = lightenColor(formattedColor, 20)
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>¡Feliz Cumpleaños!</title>
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
                <h1>¡Feliz Cumpleaños!</h1>
                <div class="company-name">${companyName}</div>
            </div>

            <div class="content">
                <div class="logo-container">
                    <img src="${systemLogo}" alt="Logo de ${companyName}">
                </div>

                <div class="greeting">
                    ¡Querido/a <span class="highlight">${firstName} ${lastName}</span>!
                </div>

                <div class="message">
                    <p>En este día tan especial, queremos tomarnos un momento para celebrar tu cumpleaños y, más importante aún, para <strong>agradecerte</strong> por tu valiosa participación en nuestra empresa.</p>

                    <p>Tu <strong>arduo esfuerzo</strong> y dedicación no pasan desapercibidos. Cada día contribuyes de manera significativa al crecimiento y éxito de <span class="highlight">${companyName}</span>, y eso es algo que valoramos profundamente.</p>

                    <p>Tu <strong>desempeño excepcional</strong> y tus <strong>competencias profesionales</strong> son un ejemplo para todos nosotros. Has demostrado ser un miembro clave de nuestro equipo, y estamos orgullosos de tenerte como parte de nuestra familia laboral.</p>

                    <p>En este nuevo año de vida, te deseamos mucha felicidad, salud, y que todos tus proyectos personales y profesionales se cumplan. <strong>Esperamos seguir trabajando juntos</strong> por muchos años más, construyendo un futuro exitoso para todos.</p>

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

export function generateBirthdayReminderEmailHtml(
    hrFirstName: string,
    hrLastName: string,
    birthdayEmployees: Employee[],
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = lightenColor(formattedColor, 20)

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

export function generateAnniversaryEmailHtml(
    firstName: string,
    lastName: string,
    yearsOfService: number,
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = lightenColor(formattedColor, 20)
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

export function generateAnniversaryReminderEmailHtml(
    hrFirstName: string,
    hrLastName: string,
    anniversaryEmployees: Employee[],
    companyName: string,
    sidebarColor: string,
    systemLogo: string
  ): string {
    // Asegurar que el color tenga el formato hexadecimal correcto
    const formattedColor = sidebarColor.startsWith('#') ? sidebarColor : `#${sidebarColor}`
    const lightColor = lightenColor(formattedColor, 20)

    // Generar la lista de empleados que cumplen aniversario
    const employeesList = anniversaryEmployees.map(employee => {
      const person = employee.person
      const department = employee.department?.departmentName || 'N/A'
      const position = employee.position?.positionName || 'N/A'

      // Calcular los años de antigüedad
      const today = DateTime.now()
      let yearsOfService = 0

      try {
        if (employee.employeeHireDate) {
          const hireDate = employee.employeeHireDate
          if (hireDate.isValid) {
            yearsOfService = Math.floor(today.diff(hireDate, 'years').years)
          }
        }
      } catch (error) {
        console.error('Error calculating years of service:', error)
        yearsOfService = 0
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
              ${yearsOfService > 0 ? yearsOfService : 'N/A'}
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
        <title>Recordatorio de Aniversario</title>
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
                <h1>🎂 Recordatorio de Aniversario</h1>
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
                    <p>Este es un recordatorio automático para informarte que <strong>${anniversaryEmployees.length} empleado(s)</strong> están celebrando su aniversario laboral hoy.</p>

                    <p>Como miembro del equipo de <strong>Recursos Humanos</strong>, te recomendamos considerar enviarles un mensaje de felicitación o coordinar alguna celebración especial para hacer que este día sea memorable para ellos.</p>
                </div>

                <div class="summary">
                    <h3>📊 Resumen del Día</h3>
                    <p><strong>Fecha:</strong> ${DateTime.now().toFormat('dd/MM/yyyy')}</p>
                    <p><strong>Total de aniversarios:</strong> ${anniversaryEmployees.length}</p>
                </div>

                <div class="action-note">
                    <strong>💡 Sugerencia:</strong> Considera enviar un mensaje personalizado o coordinar una pequeña celebración para estos empleados.
                </div>

                <h3 style="color: ${formattedColor}; margin-top: 30px;">👥 Empleados que cumplen aniversario hoy:</h3>

                <table class="employees-table">
                    <thead>
                        <tr>
                            <th>Nombre Completo</th>
                            <th>Departamento</th>
                            <th>Posición</th>
                            <th style="text-align: center;">Años de Servicio</th>
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