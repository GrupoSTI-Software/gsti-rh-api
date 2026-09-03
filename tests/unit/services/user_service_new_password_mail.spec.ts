import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import UserService from '#services/user_service'

/**
 * El aviso de "tu contraseña cambió" es la señal con la que alguien detecta un
 * acceso ajeno, así que tiene que salir venga el cambio de donde venga.
 *
 * Antes se enviaba solo si la petición traía cabecera `Origin`, que un
 * navegador manda siempre y una app nativa nunca: quien cambiaba su contraseña
 * desde el teléfono se quedaba sin aviso. Y su idioma lo decidía el
 * `Accept-Language` del cliente, así que llegaba en inglés.
 */

/** Lo que el servicio le pidió al mensaje, sin salir a ningún SMTP. */
interface CapturedMail {
  to: string
  subject: string
  view: string
  data: Record<string, unknown>
}

/**
 * Sustituye `mail.send` por un doble que ejecuta la callback contra un mensaje
 * de mentira y registra lo que se le pidió.
 */
function spyOnMailSend(): { sent: CapturedMail[]; restore: () => void } {
  const sent: CapturedMail[] = []
  const original = mail.send.bind(mail)

  ;(mail as unknown as { send: (cb: (message: unknown) => void) => Promise<void> }).send = async (
    callback
  ) => {
    const captured: Partial<CapturedMail> = {}
    const message = {
      to(address: string) {
        captured.to = address
        return message
      },
      from(address: string) {
        void address
        return message
      },
      subject(value: string) {
        captured.subject = value
        return message
      },
      htmlView(view: string, data: Record<string, unknown>) {
        captured.view = view
        captured.data = data
        return message
      },
    }
    callback(message)
    sent.push(captured as CapturedMail)
  }

  return {
    sent,
    restore: () => {
      ;(mail as unknown as { send: unknown }).send = original
    },
  }
}

/**
 * Usuario mínimo que el servicio necesita.
 *
 * El servicio hace `load('person')` para tomar el nombre de pila; aquí no hay
 * base de datos, así que se neutraliza esa carga y el correo cae al saludo con
 * el correo electrónico, que es el mismo camino que sigue un usuario sin
 * persona ligada.
 */
function makeUser(email: string): User {
  const user = new User()
  user.userEmail = email
  ;(user as unknown as { load: () => Promise<void> }).load = async () => {}
  return user
}

test.group('UserService.sendNewPasswordEmail', () => {
  test('envía el aviso aunque la petición no traiga origen (app nativa)', async ({ assert }) => {
    const spy = spyOnMailSend()
    try {
      const service = new UserService(i18nManager.locale('en'))

      await service.sendNewPasswordEmail(null, makeUser('sin-origen@ejemplo.com'))

      assert.lengthOf(spy.sent, 1, 'sin `Origin` el aviso debe salir igual')
      assert.equal(spy.sent[0].to, 'sin-origen@ejemplo.com')
      assert.equal(spy.sent[0].view, 'emails/new_password')
    } finally {
      spy.restore()
    }
  })

  test('redacta el aviso en español aunque la petición venga en inglés', async ({ assert }) => {
    const spy = spyOnMailSend()
    try {
      // El servicio recibe el i18n en inglés, como cuando el cliente manda
      // `Accept-Language: en`. El correo debe salir en español igual.
      const service = new UserService(i18nManager.locale('en'))

      await service.sendNewPasswordEmail('http://127.0.0.1:3000', makeUser('quien@ejemplo.com'))

      const expected = i18nManager
        .locale('es')
        .formatMessage('auth.password_changed.subject', { tradeName: 'Valanserh' })

      assert.lengthOf(spy.sent, 1)
      assert.equal(spy.sent[0].subject, expected)
    } finally {
      spy.restore()
    }
  })

  test('conserva el origen recibido como destino del CTA', async ({ assert }) => {
    const spy = spyOnMailSend()
    try {
      const service = new UserService(i18nManager.locale('es'))

      await service.sendNewPasswordEmail('http://127.0.0.1:3000/', makeUser('quien@ejemplo.com'))

      // La barra final se recorta para no componer URLs con doble slash.
      assert.equal(spy.sent[0].data.loginUrl, 'http://127.0.0.1:3000')
    } finally {
      spy.restore()
    }
  })
})
