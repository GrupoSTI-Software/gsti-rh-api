import { test } from '@japa/runner'
import {
  generateAnniversaryEmailHtml,
  generateBirthdayEmailHtml,
} from '#services/helpers/employee_celebration_email_html'

/**
 * Las empresas nuevas nacen sin logo (`system_setting_defaults.ts`), así que el
 * caso "sin logo" dejó de ser excepcional: el HTML no debe emitir un
 * `<img src="null">` roto en el correo.
 */
test.group('generate*EmailHtml — bloque del logo', () => {
  test('sin logo: no emite la etiqueta img ni el contenedor', ({ assert }) => {
    const html = generateBirthdayEmailHtml('Ana', 'Pérez', 'Consulting SA', 'FFFFFF', null)

    assert.notInclude(html, 'logo-container">\n')
    assert.notInclude(html, '<img src="null"')
    assert.notInclude(html, 'alt="Logo de Consulting SA"')
    assert.include(html, 'Consulting SA')
  })

  test('con logo: emite la img con la URL y el alt de la empresa', ({ assert }) => {
    const logo = 'https://cdn.example.com/logo.png'
    const html = generateBirthdayEmailHtml('Ana', 'Pérez', 'Consulting SA', 'FFFFFF', logo)

    assert.include(html, `<img src="${logo}" alt="Logo de Consulting SA">`)
  })

  test('aniversario sin logo: mismo criterio', ({ assert }) => {
    const html = generateAnniversaryEmailHtml('Ana', 'Pérez', 3, 'Consulting SA', 'FFFFFF', null)

    assert.notInclude(html, '<img src="null"')
    assert.include(html, 'Consulting SA')
  })
})
