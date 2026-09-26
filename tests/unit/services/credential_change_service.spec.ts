import { test } from '@japa/runner'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Server } from 'socket.io'
import ApiToken from '#models/api_token'
import User from '#models/user'
import Ws from '#services/ws'
import logger from '@adonisjs/core/services/logger'
import UserService from '#services/user_service'
import {
  maskEmail,
  notifyAndAudit,
  revokeSessions,
  type NotifyAndAuditParams,
} from '#services/credential_change_service'
import mail from '@adonisjs/mail/services/main'
import edge from 'edge.js'
import CredentialChangedMail from '#mails/credential_changed_mail'

type QueryOwner = {
  query: (...args: unknown[]) => unknown
}

const transaction = {} as TransactionClientContract

function notifyParams(overrides: Partial<NotifyAndAuditParams> = {}): NotifyAndAuditParams {
  return {
    actorUserId: 7,
    affectedUserId: 11,
    origin: 'person-file',
    previousEmail: 'anterior@ejemplo.com',
    newEmail: 'nuevo@ejemplo.com',
    userEmailType: 'personal',
    previousRecipients: ['anterior@ejemplo.com'],
    rawHeaders: ['User-Agent', 'Japa'],
    revokedCount: 4,
    ...overrides,
  }
}

test.group('credential_change_service.revokeSessions', (group) => {
  const apiTokenModel = ApiToken as unknown as QueryOwner
  const userModel = User as unknown as QueryOwner
  let originalApiTokenQuery: QueryOwner['query']
  let originalUserQuery: QueryOwner['query']

  group.each.setup(() => {
    originalApiTokenQuery = apiTokenModel.query
    originalUserQuery = userModel.query
  })

  group.each.teardown(() => {
    apiTokenModel.query = originalApiTokenQuery
    userModel.query = originalUserQuery
  })

  test('borra todos los tokens de los providers y devuelve el total', async ({ assert }) => {
    const filters: Array<readonly [string, number | string]> = []
    let saved = false
    const affected = {
      userToken: 'token-recuperacion',
      userTokenExpiresAt: 'fecha',
      pinCode: '123456',
      pinCodeExpiresAt: 'fecha',
      useTransaction(received: TransactionClientContract) {
        assert.strictEqual(received, transaction)
        return this
      },
      async save() {
        saved = true
      },
    }

    apiTokenModel.query = () => ({
      where(column: string, value: number) {
        filters.push([column, value])
        return this
      },
      async delete() {
        return 4
      },
    })
    userModel.query = () => ({
      where(column: string, value: number) {
        filters.push([column, value])
        return this
      },
      async firstOrFail() {
        return affected
      },
    })

    const revoked = await revokeSessions(transaction, {
      affectedUserId: 101,
      preservedTokenId: null,
    })

    assert.equal(revoked, 4)
    assert.deepInclude(filters, ['tokenable_id', 101])
    assert.isTrue(saved)
  })

  test('excluye el token indicado y sin identificador revoca todos', async ({ assert }) => {
    const exclusions: string[] = []
    let deleteCalls = 0
    apiTokenModel.query = () => ({
      where() {
        return this
      },
      whereNot(column: string, value: string) {
        assert.equal(column, 'id')
        exclusions.push(value)
        return this
      },
      async delete() {
        deleteCalls += 1
        return 1
      },
    })
    userModel.query = () => ({
      where() {
        return this
      },
      async firstOrFail() {
        return {
          userToken: 'token',
          userTokenExpiresAt: 'fecha',
          pinCode: '1234',
          pinCodeExpiresAt: 'fecha',
          useTransaction() {
            return this
          },
          async save() {},
        }
      },
    })

    await revokeSessions(transaction, { affectedUserId: 11, preservedTokenId: '88' })
    await revokeSessions(transaction, { affectedUserId: 11, preservedTokenId: null })

    assert.deepEqual(exclusions, ['88'])
    assert.equal(deleteCalls, 2)
  })

  test('invalida token y PIN de recuperación dentro de la misma transacción', async ({
    assert,
  }) => {
    let transactionUsed: TransactionClientContract | undefined
    const affected = {
      userToken: 'token',
      userTokenExpiresAt: 'fecha' as string | null,
      pinCode: '5678',
      pinCodeExpiresAt: 'fecha' as string | null,
      useTransaction(received: TransactionClientContract) {
        transactionUsed = received
        return this
      },
      async save() {},
    }
    apiTokenModel.query = () => ({
      where() {
        return this
      },
      async delete() {
        return 0
      },
    })
    userModel.query = () => ({
      where() {
        return this
      },
      async firstOrFail() {
        return affected
      },
    })

    await revokeSessions(transaction, { affectedUserId: 11, preservedTokenId: null })

    assert.equal(affected.userToken, '')
    assert.isNull(affected.userTokenExpiresAt)
    assert.equal(affected.pinCode, '')
    assert.isNull(affected.pinCodeExpiresAt)
    assert.strictEqual(transactionUsed, transaction)
  })
})

test.group('credential_change_service.notifyAndAudit', (group) => {
  const userServicePrototype = UserService.prototype as unknown as {
    saveActionOnLog: (log: unknown) => Promise<void>
  }
  const loggerOwner = logger as unknown as {
    info: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
  let originalIo: Server | undefined
  let originalSaveActionOnLog: typeof userServicePrototype.saveActionOnLog
  let originalLoggerInfo: typeof loggerOwner.info
  let originalLoggerError: typeof loggerOwner.error

  group.each.setup(() => {
    originalIo = Ws.io
    originalSaveActionOnLog = userServicePrototype.saveActionOnLog
    originalLoggerInfo = loggerOwner.info
    originalLoggerError = loggerOwner.error
    loggerOwner.error = () => {}
  })

  group.each.teardown(() => {
    Ws.io = originalIo
    userServicePrototype.saveActionOnLog = originalSaveActionOnLog
    loggerOwner.info = originalLoggerInfo
    loggerOwner.error = originalLoggerError
  })

  test('emite cierre en los seis canales del correo anterior y el nuevo', async ({ assert }) => {
    const events: string[] = []
    Ws.io = {
      emit(event: string) {
        events.push(event)
        return true
      },
    } as unknown as Server
    userServicePrototype.saveActionOnLog = async () => {}
    loggerOwner.info = () => {}

    await notifyAndAudit(notifyParams())

    assert.deepEqual(events, [
      'user-forze-logout:anterior@ejemplo.com',
      'user-forze-logout:anterior@ejemplo.com:web',
      'user-forze-logout:anterior@ejemplo.com:app',
      'user-forze-logout:nuevo@ejemplo.com',
      'user-forze-logout:nuevo@ejemplo.com:web',
      'user-forze-logout:nuevo@ejemplo.com:app',
    ])
  })

  test('guarda únicamente la lista blanca de cuatro campos de la credencial', async ({
    assert,
  }) => {
    let capturedLog: Record<string, unknown> | undefined
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async (log) => {
      capturedLog = log as Record<string, unknown>
    }
    loggerOwner.info = () => {}

    await notifyAndAudit(notifyParams())

    const previous = capturedLog?.record_previous as Record<string, unknown>
    const current = capturedLog?.record_current as Record<string, unknown>
    assert.deepEqual(previous, {
      user_id: 11,
      user_email: 'anterior@ejemplo.com',
      user_email_type: 'personal',
    })
    assert.deepEqual(current, {
      user_id: 11,
      user_email: 'nuevo@ejemplo.com',
      user_email_type: 'personal',
      mirror_origin: 'person-file',
    })
  })

  test('si la escritura del asiento lanza no se relanza y el contador no filtra correos', async ({
    assert,
  }) => {
    let counter: Record<string, unknown> | undefined
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async () => {
      throw new Error('Mongo no disponible para anterior@ejemplo.com')
    }
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }

    await assert.doesNotReject(() => notifyAndAudit(notifyParams()))

    assert.isFalse(counter?.logged)
    assert.equal(counter?.revoked, 4)
    assert.notInclude(JSON.stringify(counter), '@ejemplo.com')
  })

  test('envía correos a previous y current y marca notified true cuando ambos tienen éxito', async ({
    assert,
  }) => {
    const sentMails: unknown[] = []
    const originalSend = mail.send.bind(mail)
    ;(mail as unknown as { send: (m: unknown) => Promise<void> }).send = async (m) => {
      sentMails.push(m)
    }
    let counter: Record<string, unknown> | undefined
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async () => {}
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }

    try {
      await notifyAndAudit(
        notifyParams({
          previousRecipients: ['viejo1@ejemplo.com', 'viejo2@ejemplo.com'],
          newEmail: 'nuevo@ejemplo.com',
        })
      )

      assert.equal(sentMails.length, 3)
      assert.isTrue(counter?.notified)
      assert.isTrue(counter?.logged)
    } finally {
      ;(mail as unknown as { send: typeof originalSend }).send = originalSend
    }
  })

  test('un fallo en el buzón viejo no impide el nuevo y marca notified false', async ({
    assert,
  }) => {
    const attemptedRecipients: string[] = []
    const originalSend = mail.send.bind(mail)
    const capturedErrors: Array<{ to?: string; msg?: string }> = []
    loggerOwner.error = (data, msg) => {
      capturedErrors.push({ ...(data as Record<string, unknown>), msg: msg as string })
    }
    ;(mail as unknown as { send: (m: unknown) => Promise<void> }).send = async (m) => {
      const mailInstance = m as { params: { to: string } }
      attemptedRecipients.push(mailInstance.params.to)
      if (mailInstance.params.to === 'fallido@ejemplo.com') {
        throw new Error('SMTP connection refused')
      }
    }
    let counter: Record<string, unknown> | undefined
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async () => {}
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }

    try {
      await notifyAndAudit(
        notifyParams({
          previousRecipients: ['fallido@ejemplo.com'],
          newEmail: 'nuevo@ejemplo.com',
        })
      )

      assert.deepEqual(attemptedRecipients, ['fallido@ejemplo.com', 'nuevo@ejemplo.com'])
      assert.isFalse(counter?.notified)
      assert.notInclude(JSON.stringify(counter), '@ejemplo.com')
      assert.isTrue(capturedErrors.some((entry) => entry.to === '***@ejemplo.com'))
      assert.isFalse(
        capturedErrors.some((entry) => JSON.stringify(entry).includes('fallido@ejemplo.com'))
      )
    } finally {
      ;(mail as unknown as { send: typeof originalSend }).send = originalSend
    }
  })

  test('sanea errores SMTP ocultando correos y registrando únicamente campos seguros', async ({
    assert,
  }) => {
    const originalSend = mail.send.bind(mail)
    const capturedErrors: Array<Record<string, unknown>> = []
    loggerOwner.error = (data, msg) => {
      capturedErrors.push({ ...(data as Record<string, unknown>), msg: msg as string })
    }

    const smtpError = new Error('550 User victim@ejemplo.com not found at mail.server')
    ;(smtpError as unknown as { code: string }).code = 'ESMTP550'
    ;(mail as unknown as { send: (m: unknown) => Promise<void> }).send = async () => {
      throw smtpError
    }
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async () => {}
    loggerOwner.info = () => {}

    try {
      await notifyAndAudit(
        notifyParams({
          previousRecipients: ['victima@ejemplo.com'],
          newEmail: 'nueva@ejemplo.com',
        })
      )

      assert.isTrue(capturedErrors.length > 0)
      for (const entry of capturedErrors) {
        assert.equal(entry.errName, 'Error')
        assert.equal(entry.errCode, 'ESMTP550')
        assert.equal(entry.errMsg, '550 User [redacted] not found at mail.server')
        assert.notInclude(JSON.stringify(entry), 'victim@ejemplo.com')
        assert.notInclude(JSON.stringify(entry), 'victima@ejemplo.com')
        assert.notInclude(JSON.stringify(entry), 'nueva@ejemplo.com')
      }
    } finally {
      ;(mail as unknown as { send: typeof originalSend }).send = originalSend
    }
  })

  test('un fallo del logger en el primer correo no interrumpe el aviso al segundo correo', async ({
    assert,
  }) => {
    const attemptedRecipients: string[] = []
    const originalSend = mail.send.bind(mail)

    loggerOwner.error = () => {
      throw new Error('Logger disk full')
    }
    ;(mail as unknown as { send: (m: unknown) => Promise<void> }).send = async (m) => {
      const mailInstance = m as { params: { to: string } }
      attemptedRecipients.push(mailInstance.params.to)
      if (mailInstance.params.to === 'fallido@ejemplo.com') {
        throw new Error('SMTP connection refused')
      }
    }
    let counter: Record<string, unknown> | undefined
    Ws.io = undefined
    userServicePrototype.saveActionOnLog = async () => {}
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }

    try {
      await assert.doesNotReject(() =>
        notifyAndAudit(
          notifyParams({
            previousRecipients: ['fallido@ejemplo.com'],
            newEmail: 'nuevo@ejemplo.com',
          })
        )
      )

      assert.deepEqual(attemptedRecipients, ['fallido@ejemplo.com', 'nuevo@ejemplo.com'])
      assert.isFalse(counter?.notified)
    } finally {
      ;(mail as unknown as { send: typeof originalSend }).send = originalSend
    }
  })
})

test.group('maskEmail', () => {
  test('enmascara con •••@dominio cuando el usuario local tiene 0 o 1 caracteres', ({ assert }) => {
    assert.equal(maskEmail('a@ejemplo.com'), '•••@ejemplo.com')
    assert.equal(maskEmail('@ejemplo.com'), '•••@ejemplo.com')
  })

  test('enmascara con primer y último carácter cuando el usuario local tiene 2 o más caracteres', ({
    assert,
  }) => {
    assert.equal(maskEmail('ab@ejemplo.com'), 'a•••b@ejemplo.com')
    assert.equal(maskEmail('nuevo@ejemplo.com'), 'n•••o@ejemplo.com')
    assert.equal(maskEmail('usuario.prueba@empresa.com.mx'), 'u•••a@empresa.com.mx')
  })

  test('devuelve ••• si no hay dominio o el correo es inválido', ({ assert }) => {
    assert.equal(maskEmail('invalido'), '•••')
    assert.equal(maskEmail(''), '•••')
    assert.equal(maskEmail('algo@'), '•••')
  })
})

test.group('CredentialChangedMail', () => {
  test('prepara ambas variantes con asunto y vista correcta', ({ assert }) => {
    const branding = {
      tradeName: 'Valanserh',
      backgroundImageLogo: 'https://ejemplo.com/logo.png',
    }
    const previous = new CredentialChangedMail({
      to: 'anterior@ejemplo.com',
      from: 'no-reply@valanserh.local',
      firstName: 'Juan',
      variant: 'previous',
      newEmailDisplay: 'n•••o@ejemplo.com',
      changedAt: '2026-09-24T19:30:00.000Z',
      loginUrl: 'https://app.valanserh.com',
      language: 'es',
      branding,
    })
    previous.prepare()
    assert.equal(
      previous.message.nodeMailerMessage.subject,
      'Tu correo de acceso a Valanserh cambió'
    )

    const current = new CredentialChangedMail({
      to: 'nuevo@ejemplo.com',
      from: 'no-reply@valanserh.local',
      firstName: 'Juan',
      variant: 'current',
      newEmailDisplay: 'nuevo@ejemplo.com',
      changedAt: '2026-09-24T19:30:00.000Z',
      loginUrl: 'https://app.valanserh.com',
      language: 'es',
      branding,
    })
    current.prepare()
    assert.equal(current.message.nodeMailerMessage.subject, 'Así entras ahora a Valanserh')
  })

  test('escribe la fecha del cambio en la zona y el idioma del destinatario', ({ assert }) => {
    const previous = new CredentialChangedMail({
      to: 'anterior@ejemplo.com',
      from: 'no-reply@valanserh.local',
      firstName: 'Juan',
      variant: 'previous',
      newEmailDisplay: 'n•••o@ejemplo.com',
      changedAt: '2026-09-24T19:30:00.000Z',
      loginUrl: '',
      language: 'es',
      branding: { tradeName: 'Valanserh', backgroundImageLogo: '' },
    })
    previous.prepare()

    const data = previous.message.contentViews.html?.data ?? {}
    assert.equal(data.changedAt, '24 de septiembre de 2026, 1:30 pm')
    assert.include(String(data.bodyPrevious), '24 de septiembre de 2026, 1:30 pm')
    assert.notInclude(String(data.bodyPrevious), '2026-09-24T19:30')
  })

  test('renderiza la plantilla emails/credential_changed para ambas variantes', async ({
    assert,
  }) => {
    const brandedView = {
      subject: 'Tu correo de acceso a Valanserh cambió',
      preheader: 'Aviso de seguridad sobre tu acceso',
      tradeName: 'Valanserh',
      backgroundImageLogo: 'https://ejemplo.com/logo.png',
    }
    const previousHtml = await edge.render('emails/credential_changed', {
      ...brandedView,
      isPreviousRecipient: true,
      titlePrevious: 'Tu correo de acceso cambió',
      titleCurrent: 'Tu acceso usa una dirección nueva',
      greetingLead: 'Hola, Juan:',
      bodyPrevious:
        'El correo con el que ingresas a Valanserh cambió el 2026-09-24. Esta dirección ya no sirve para iniciar sesión.',
      bodyCurrent: 'Tu acceso a Valanserh ahora usa esta dirección.',
      newEmailLabel: 'Correo de acceso',
      newEmailDisplay: 'n•••o@ejemplo.com',
      alertTitle: '¿No lo solicitaste?',
      alertBody: 'Contacta de inmediato a tu área de Recursos Humanos o a soporte.',
      supportLinkCaption: 'Escríbele a soporte si no reconoces este cambio.',
      footer: 'Este es un mensaje automático de Valanserh.',
    })

    assert.include(previousHtml, '<!DOCTYPE html>')
    assert.include(previousHtml, '<title>Tu correo de acceso a Valanserh cambió</title>')
    assert.include(previousHtml, 'Aviso de seguridad sobre tu acceso')
    assert.include(previousHtml, 'src="https://ejemplo.com/logo.png"')
    assert.include(previousHtml, 'alt="Valanserh"')
    assert.include(previousHtml, 'Tu correo de acceso cambió')
    assert.include(previousHtml, 'Hola, Juan:')
    assert.include(previousHtml, 'n•••o@ejemplo.com')
    assert.include(previousHtml, '¿No lo solicitaste?')
    assert.include(previousHtml, 'Escríbele a soporte')
    assert.notInclude(previousHtml, 'Iniciar sesión')

    const currentHtml = await edge.render('emails/credential_changed', {
      ...brandedView,
      isPreviousRecipient: false,
      titlePrevious: 'Tu correo de acceso cambió',
      titleCurrent: 'Tu acceso usa una dirección nueva',
      greetingLead: 'Hola, Juan:',
      bodyPrevious: 'El correo con el que ingresas a Valanserh cambió.',
      bodyCurrent: 'Tu acceso a Valanserh ahora usa esta dirección.',
      newEmailLabel: 'Correo de acceso',
      newEmailDisplay: 'nuevo@ejemplo.com',
      passwordUnchangedNotice: 'Tu contraseña no cambió.',
      sessionsClosedNotice: 'Las sesiones abiertas con la dirección anterior se cerraron.',
      loginUrl: 'https://app.valanserh.com',
      cta: 'Iniciar sesión',
      ctaCaption: 'Entra con tu correo nuevo y tu contraseña de siempre.',
      footer: 'Este es un mensaje automático de Valanserh.',
    })

    assert.include(currentHtml, 'Tu acceso usa una dirección nueva')
    assert.include(currentHtml, 'Hola, Juan:')
    assert.include(currentHtml, 'nuevo@ejemplo.com')
    assert.include(currentHtml, 'Tu contraseña no cambió.')
    assert.include(currentHtml, 'https://app.valanserh.com')
    assert.include(currentHtml, 'Iniciar sesión')
    assert.notInclude(currentHtml, '¿No lo solicitaste?')
    assert.include(currentHtml, 'src="https://ejemplo.com/logo.png"')
  })
})
