import { test } from '@japa/runner'
import {
  MAIL_BRAND_HEADER_COLOR,
  MAIL_BRAND_LOGO_URL,
  MAIL_BRAND_TRADE_NAME,
} from '#constants/mail_branding'
import {
  generateAnniversaryEmailHtml,
  generateAnniversaryReminderEmailHtml,
  generateBirthdayEmailHtml,
  generateBirthdayReminderEmailHtml,
} from '#services/helpers/employee_celebration_email_html'

test.group('Felicitaciones — marca Valanserh y escape', () => {
  test('cumpleaños: cabecera de Valanserh y la empresa solo como contenido', ({ assert }) => {
    const html = generateBirthdayEmailHtml('Ana', 'Pérez', 'Consulting SA')

    assert.include(html, MAIL_BRAND_LOGO_URL)
    assert.include(html, `class="company-name">${MAIL_BRAND_TRADE_NAME}<`)
    assert.include(html, MAIL_BRAND_HEADER_COLOR)
    assert.include(html, `sistema de ${MAIL_BRAND_TRADE_NAME}`)
    assert.include(html, 'El equipo de Consulting SA')
    assert.include(html, 'éxito de <span class="highlight">Consulting SA</span>')
    assert.notInclude(html, 'Logo de Consulting SA')
    assert.notInclude(html, 'sistema de Consulting SA')
    assert.notInclude(html, '#FF0000')
    assert.notInclude(html, 'El equipo de Valanserh')
  })

  test('aniversario: misma marca y la empresa en el saludo', ({ assert }) => {
    const html = generateAnniversaryEmailHtml('Ana', 'Pérez', 3, 'Consulting SA')

    assert.include(html, MAIL_BRAND_LOGO_URL)
    assert.include(html, `class="company-name">${MAIL_BRAND_TRADE_NAME}<`)
    assert.include(html, MAIL_BRAND_HEADER_COLOR)
    assert.include(html, `sistema de ${MAIL_BRAND_TRADE_NAME}`)
    assert.include(html, 'El equipo de Consulting SA')
    assert.include(html, 'éxito de <span class="highlight">Consulting SA</span>')
    assert.notInclude(html, '#FF0000')
  })

  test('recordatorios a RH: cabecera, logo y pie de Valanserh', ({ assert }) => {
    for (const html of [
      generateBirthdayReminderEmailHtml('Luisa', 'RH', []),
      generateAnniversaryReminderEmailHtml('Luisa', 'RH', []),
    ]) {
      assert.include(html, MAIL_BRAND_LOGO_URL)
      assert.include(html, `class="company-name">${MAIL_BRAND_TRADE_NAME}<`)
      assert.include(html, MAIL_BRAND_HEADER_COLOR)
      assert.include(html, `sistema de ${MAIL_BRAND_TRADE_NAME}`)
      assert.include(html, MAIL_BRAND_TRADE_NAME)
    }
  })

  test('escapa el nombre comercial y el nombre de pila', ({ assert }) => {
    const html = generateBirthdayEmailHtml('Ana', 'Pérez', '<b>Empresa</b> & Co')

    assert.notInclude(html, '<b>Empresa</b>')
    assert.include(html, '&lt;b&gt;Empresa&lt;/b&gt; &amp; Co')

    const scripted = generateBirthdayEmailHtml('<script>alert(1)</script>', 'Pérez', 'Consulting SA')
    assert.notInclude(scripted, '<script>')
    assert.include(scripted, '&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
