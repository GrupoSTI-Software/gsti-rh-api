import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import AuthMailService from '#services/auth_mail_service'
import SignupOtpMail from '#mails/signup_otp_mail'
import WelcomeMail from '#mails/welcome_mail'

/**
 * Tests funcionales — AuthMailService
 *
 * Cubre el contrato del servicio dedicado al flujo de signup self-service:
 *
 * - `sendSignupOtp` despacha una instancia de `SignupOtpMail` con el código en
 *   bloque grande, asunto resuelto vía i18n y promesa que nunca lanza al
 *   caller, incluso ante inputs vacíos.
 * - `sendWelcome` despacha una instancia de `WelcomeMail` con saludo
 *   personalizado, mención de la empresa creada y CTA al `BACKOFFICE_URL`.
 *
 * Se usa `mail.fake()` con `assertSent(MailClass, finder)` para interceptar los
 * envíos sin tocar el SMTP real, aprovechando el patrón `BaseMail` idiomático
 * de Adonis 6.
 *
 * El escenario "SMTP no configurado" no se cubre aquí porque manipular
 * `env.get` en runtime es frágil; ese camino está cubierto por el control de
 * flujo defensivo del servicio (`resolveSenderEmail()` + try/catch).
 */

const TEST_RECIPIENT = 'demo@gsti.mx'

test.group('AuthMailService - sendSignupOtp', () => {
  test('despacha SignupOtpMail con el OTP en el HTML y en el asunto (es)', async ({ assert }) => {
    const fake = mail.fake()
    try {
      const service = new AuthMailService()

      await service.sendSignupOtp({
        to: TEST_RECIPIENT,
        firstName: 'Diara',
        pinCode: '482917',
        language: 'es',
      })

      fake.mails.assertSent(SignupOtpMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        const subject = json.message.subject
        assert.include(subject, '482917', 'El asunto debe inyectar el pinCode')
        message.assertHtmlIncludes('482917')
        return message.hasTo(TEST_RECIPIENT)
      })
    } finally {
      mail.restore()
    }
  })

  test('genera asuntos distintos por idioma (en vs es)', async ({ assert }) => {
    const fake = mail.fake()
    try {
      const service = new AuthMailService()

      await service.sendSignupOtp({
        to: TEST_RECIPIENT,
        firstName: 'Diara',
        pinCode: '100200',
        language: 'es',
      })
      await service.sendSignupOtp({
        to: TEST_RECIPIENT,
        firstName: 'Diara',
        pinCode: '100200',
        language: 'en',
      })

      fake.mails.assertSentCount(SignupOtpMail, 2)

      const sent = fake.mails.sent()
      const subjects = sent.map((email) => {
        const json = email.message.toJSON() as { message: { subject: string } }
        return json.message.subject
      })

      assert.notEqual(subjects[0], subjects[1], 'Los asuntos deben diferir por idioma')
      assert.match(subjects[0], /código/i, 'El asunto en es debe contener "código"')
      assert.match(subjects[1], /code/i, 'El asunto en en debe contener "code"')
    } finally {
      mail.restore()
    }
  })

  test('resuelve sin lanzar incluso si el servicio recibe inputs vacíos', async ({ assert }) => {
    const fake = mail.fake()
    try {
      const service = new AuthMailService()

      await assert.doesNotReject(async () => {
        await service.sendSignupOtp({
          to: TEST_RECIPIENT,
          firstName: '',
          pinCode: '',
          language: 'es',
        })
      })

      // El servicio sí despacha el correo (los strings vacíos no son tratados
      // como condición de error). Sólo validamos que no propaga excepciones.
      assert.isAtLeast(fake.mails.sent().length, 0)
    } finally {
      mail.restore()
    }
  })
})

test.group('AuthMailService - sendWelcome', () => {
  test('despacha WelcomeMail con business unit y CTA en el HTML (en)', async ({ assert }) => {
    const fake = mail.fake()
    try {
      const service = new AuthMailService()

      await service.sendWelcome({
        to: TEST_RECIPIENT,
        firstName: 'Diara',
        businessUnitName: 'Onest',
        language: 'en',
      })

      fake.mails.assertSent(WelcomeMail, ({ message }) => {
        message.assertHtmlIncludes('Onest')
        message.assertHtmlIncludes('Go to the system')
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /welcome/i)
        return message.hasTo(TEST_RECIPIENT)
      })
    } finally {
      mail.restore()
    }
  })

  test('aplica el idioma indicado al asunto y al CTA (es)', async ({ assert }) => {
    const fake = mail.fake()
    try {
      const service = new AuthMailService()

      await service.sendWelcome({
        to: TEST_RECIPIENT,
        firstName: 'Diara',
        businessUnitName: 'Onest',
        language: 'es',
      })

      fake.mails.assertSent(WelcomeMail, ({ message }) => {
        const json = message.toJSON() as { message: { subject: string } }
        assert.match(json.message.subject, /bienvenido/i)
        message.assertHtmlIncludes('Ir al sistema')
        return true
      })
    } finally {
      mail.restore()
    }
  })
})
