import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import CredentialChangedMail from '#mails/credential_changed_mail'
import User from '#models/user'
import { LogStore } from '#models/MongoDB/log_store'
import { maskEmail } from '#services/credential_change_service'
import UserService from '#services/user_service'
import { grantRoleModulePermissions } from '#tests/helpers/tenant_actor'
import {
  businessUnitHeader,
  cleanupMirrorWorld,
  createEmployeeFor,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  employeeBody,
  personBody,
  readPersonEmail,
  readPersonFirstname,
  readUserRow,
  stamp,
  userBody,
  type CapturedLog,
  type MirrorWorld,
} from './person_user_email_mirror_support.js'

type LoggerOwner = {
  info: (data: unknown, message?: string) => void
}

type MailSender = {
  send: (mailMessage: unknown) => Promise<unknown>
}

type LogWriter = {
  saveActionOnLog: (log: unknown) => Promise<void>
}

let world: MirrorWorld | null = null
let originalLogStoreSet: typeof LogStore.set | null = null

function credentialLogs(logs: readonly CapturedLog[]): CapturedLog[] {
  return logs.filter(
    (entry) => entry.collection === 'log_users' && entry.payload.action === 'credential-change'
  )
}

function captureLogs(): { logs: CapturedLog[]; restore: () => void } {
  const original = LogStore.set
  const logs: CapturedLog[] = []
  LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
    logs.push({ collection: collectionName, payload: logData })
  }
  return {
    logs,
    restore: () => {
      LogStore.set = original
    },
  }
}

async function createSessions(user: User): Promise<void> {
  await User.accessTokens.create(user)
  await User.refreshTokens.create(user)
}

async function tokenCount(userId: number): Promise<number> {
  const row = await db
    .from('api_tokens')
    .where('tokenable_id', userId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

function assertCredentialAudit(
  assert: Assert,
  logs: readonly CapturedLog[],
  expected: {
    actorUserId: number
    affectedUserId: number
    previousEmail: string
    newEmail: string
    origin: 'person-file' | 'user-screen' | 'employee-file'
  }
): void {
  const entries = credentialLogs(logs)
  assert.lengthOf(entries, 1)
  const entry = entries[0].payload
  assert.equal(entry.user_id, expected.actorUserId)
  assert.deepEqual(entry.record_previous, {
    user_id: expected.affectedUserId,
    user_email: expected.previousEmail,
    user_email_type: expected.origin === 'employee-file' ? 'institutional' : 'personal',
  })
  assert.deepEqual(entry.record_current, {
    user_id: expected.affectedUserId,
    user_email: expected.newEmail,
    user_email_type: expected.origin === 'employee-file' ? 'institutional' : 'personal',
    mirror_origin: expected.origin,
  })
}

function assertTwoNotices(
  assert: Assert,
  fake: ReturnType<typeof mail.fake>,
  previousEmail: string,
  newEmail: string
): void {
  fake.mails.assertSentCount(CredentialChangedMail, 2)
  fake.mails.assertSent(CredentialChangedMail, ({ message }) => {
    if (!message.hasTo(previousEmail)) return false
    const maskedEmail = maskEmail(newEmail)
    const html = String(message.toJSON().message.html ?? '')
    assert.include(html, maskedEmail)
    assert.notInclude(html, newEmail)
    return true
  })
  fake.mails.assertSent(CredentialChangedMail, ({ message }) => {
    if (!message.hasTo(newEmail)) return false
    message.assertHtmlIncludes(newEmail)
    message.assertHtmlIncludes('Tu contraseña no cambió.')
    return true
  })
}

function putPerson(client: ApiClient, personId: number, body: Record<string, unknown>) {
  const w = world!
  return client
    .put(`/api/persons/${personId}`)
    .loginAs(w.full.user)
    .headers(businessUnitHeader(w.full.businessUnit))
    .json(body)
}

test.group('Consecuencias funcionales del cambio de credencial', (group) => {
  group.each.setup(async () => {
    world = await createMirrorWorld()
    originalLogStoreSet = LogStore.set
    LogStore.set = async () => {}
  })

  group.each.teardown(async () => {
    if (originalLogStoreSet) LogStore.set = originalLogStoreSet
    originalLogStoreSet = null
    await cleanupMirrorWorld(world)
    world = null
  })

  test('acto completo desde expediente: revoca, avisa a ambos destinos y registra', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const previousEmail = `expediente-${stamp()}@correo.com`
      const newEmail = `nuevo-expediente-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.full.businessUnit, previousEmail)
      const affected = await createUserFor(
        w.registry,
        person,
        w.full.role,
        [w.full.businessUnit],
        { userEmail: previousEmail, userEmailType: 'personal' }
      )
      await createSessions(affected)

      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: newEmail })
      )

      response.assertStatus(201)
      assert.equal(await tokenCount(affected.userId), 0)
      assertTwoNotices(assert, fake, previousEmail, newEmail)
      assertCredentialAudit(assert, captured.logs, {
        actorUserId: w.full.user.userId,
        affectedUserId: affected.userId,
        previousEmail,
        newEmail,
        origin: 'person-file',
      })
    } finally {
      captured.restore()
    }
  })

  test('acto completo desde usuario: revoca, avisa a ambos destinos y registra', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const previousEmail = `usuario-${stamp()}@correo.com`
      const newEmail = `nuevo-usuario-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.full.businessUnit, previousEmail)
      const affected = await createUserFor(
        w.registry,
        person,
        w.full.role,
        [w.full.businessUnit],
        { userEmail: previousEmail, userEmailType: 'personal' }
      )
      await createSessions(affected)

      const response = await client
        .put(`/api/users/${affected.userId}`)
        .loginAs(w.full.user)
        .headers(businessUnitHeader(w.full.businessUnit))
        .json(userBody(affected, { userEmail: newEmail }))

      response.assertStatus(201)
      assert.equal(await tokenCount(affected.userId), 0)
      assertTwoNotices(assert, fake, previousEmail, newEmail)
      assertCredentialAudit(assert, captured.logs, {
        actorUserId: w.full.user.userId,
        affectedUserId: affected.userId,
        previousEmail,
        newEmail,
        origin: 'user-screen',
      })
    } finally {
      captured.restore()
    }
  })

  test('acto completo desde empleado: revoca, avisa a ambos destinos y registra', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const previousEmail = `empleado-${stamp()}@empresa.com`
      const newEmail = `nuevo-empleado-${stamp()}@empresa.com`
      const person = await createPersonIn(w.registry, w.full.businessUnit, null)
      const employee = await createEmployeeFor(
        w.registry,
        person,
        w.full.businessUnit,
        previousEmail
      )
      const affected = await createUserFor(
        w.registry,
        person,
        w.full.role,
        [w.full.businessUnit],
        { userEmail: previousEmail, userEmailType: 'institutional' }
      )
      await createSessions(affected)

      const response = await client
        .put(`/api/employees/${employee.employeeId}`)
        .loginAs(w.full.user)
        .headers(businessUnitHeader(w.full.businessUnit))
        .json(employeeBody(employee, { employeeBusinessEmail: newEmail }))

      response.assertStatus(201)
      assert.equal(await tokenCount(affected.userId), 0)
      assertTwoNotices(assert, fake, previousEmail, newEmail)
      assertCredentialAudit(assert, captured.logs, {
        actorUserId: w.full.user.userId,
        affectedUserId: affected.userId,
        previousEmail,
        newEmail,
        origin: 'employee-file',
      })
    } finally {
      captured.restore()
    }
  })

  test('sin permiso responde 403 PERM.DENIED y no deja efectos', async ({ client, assert }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      await grantRoleModulePermissions(w.limited.role, 'users', ['update'])
      const previousEmail = `sin-permiso-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.limited.businessUnit, previousEmail)
      const affected = await createUserFor(
        w.registry,
        person,
        w.limited.role,
        [w.limited.businessUnit],
        { userEmail: previousEmail, userEmailType: 'personal' }
      )
      await createSessions(affected)
      const beforeTokens = await tokenCount(affected.userId)

      const response = await client
        .put(`/api/persons/${person.personId}`)
        .loginAs(w.limited.user)
        .headers(businessUnitHeader(w.limited.businessUnit))
        .json(personBody(person, { personEmail: `atacante-${stamp()}@correo.com` }))

      response.assertStatus(403)
      response.assertBodyContains({
        title: 'Sin permiso',
        detail: 'No tienes permiso para realizar esta operación.',
        key: 'PERM.DENIED',
      })
      const userRow = await readUserRow(affected.userId)
      assert.equal(userRow.user_email, previousEmail)
      assert.equal(await readPersonEmail(person.personId), previousEmail)
      assert.equal(await tokenCount(affected.userId), beforeTokens)
      fake.mails.assertNoneSent()
      assert.lengthOf(credentialLogs(captured.logs), 0)
    } finally {
      captured.restore()
    }
  })

  test('un conflicto revierte el cambio sin revocar, notificar ni registrar', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const occupied = `ocupado-${stamp()}@correo.com`
      await createUserFor(
        w.registry,
        await createPersonIn(w.registry, w.full.businessUnit, null),
        w.full.role,
        [w.full.businessUnit],
        { userEmail: occupied, userEmailType: 'institutional' }
      )
      const previousEmail = `rollback-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.full.businessUnit, previousEmail)
      const affected = await createUserFor(
        w.registry,
        person,
        w.full.role,
        [w.full.businessUnit],
        { userEmail: previousEmail, userEmailType: 'personal' }
      )
      await createSessions(affected)
      const beforeTokens = await tokenCount(affected.userId)

      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: occupied, personFirstname: 'Revertido' })
      )

      response.assertStatus(400)
      const userRow = await readUserRow(affected.userId)
      assert.equal(userRow.user_email, previousEmail)
      assert.equal(await readPersonEmail(person.personId), previousEmail)
      assert.equal(await tokenCount(affected.userId), beforeTokens)
      fake.mails.assertNoneSent()
      assert.lengthOf(credentialLogs(captured.logs), 0)
    } finally {
      captured.restore()
    }
  })

  test('editar sin cambiar el correo y already-in-sync no producen consecuencias', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const email = `sin-cambio-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.full.businessUnit, email)
      const affected = await createUserFor(
        w.registry,
        person,
        w.full.role,
        [w.full.businessUnit],
        { userEmail: email, userEmailType: 'personal' }
      )
      await createSessions(affected)
      const beforeTokens = await tokenCount(affected.userId)

      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: email })
      )

      response.assertStatus(201)
      assert.deepEqual(response.body().data.emailMirror, {
        status: 'skipped',
        reason: 'already-in-sync',
      })
      assert.equal(await tokenCount(affected.userId), beforeTokens)
      fake.mails.assertNotSent(CredentialChangedMail)
      assert.lengthOf(credentialLogs(captured.logs), 0)
    } finally {
      captured.restore()
    }
  })

  test('editar sin enviar personEmail no exige credential-change ni produce consecuencias', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      await grantRoleModulePermissions(w.limited.role, 'users', ['update'])
      const email = `campo-omitido-${stamp()}@correo.com`
      const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
      const affected = await createUserFor(
        w.registry,
        person,
        w.limited.role,
        [w.limited.businessUnit],
        { userEmail: email, userEmailType: 'personal' }
      )
      await createSessions(affected)
      const beforeTokens = await tokenCount(affected.userId)
      const beforeMails = fake.mails.sent().length

      const response = await client
        .put(`/api/persons/${person.personId}`)
        .loginAs(w.limited.user)
        .headers(businessUnitHeader(w.limited.businessUnit))
        .json({
          personFirstname: 'Nombre actualizado',
          personLastname: person.personLastname,
          personSecondLastname: person.personSecondLastname,
          personGender: 'Mujer',
          personBirthday: null,
        })

      response.assertStatus(201)
      assert.deepEqual(response.body().data.emailMirror, {
        status: 'skipped',
        reason: 'source-email-empty',
      })
      assert.equal(await readPersonFirstname(person.personId), 'Nombre actualizado')
      assert.equal(await readPersonEmail(person.personId), email)
      const userRow = await readUserRow(affected.userId)
      assert.equal(userRow.user_email, email)
      assert.equal(await tokenCount(affected.userId), beforeTokens)
      assert.equal(fake.mails.sent().length, beforeMails)
      assert.lengthOf(credentialLogs(captured.logs), 0)
    } finally {
      captured.restore()
    }
  })

  test('el alta de usuario espeja el correo sin consecuencias de cambio', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const captured = captureLogs()
    try {
      const person = await createPersonIn(
        w.registry,
        w.full.businessUnit,
        `alta-anterior-${stamp()}@correo.com`
      )
      const newEmail = `alta-${stamp()}@correo.com`

      const response = await client
        .post('/api/users')
        .loginAs(w.full.user)
        .headers(businessUnitHeader(w.full.businessUnit))
        .json({
          userEmail: newEmail,
          userActive: true,
          roleId: w.full.role.roleId,
          personId: person.personId,
          userEmailType: 'personal',
        })

      response.assertStatus(201)
      const createdId = Number(response.body().data.user.userId)
      w.registry.userIds.push(createdId)
      assert.equal(await readPersonEmail(person.personId), newEmail)
      assert.equal(await tokenCount(createdId), 0)
      fake.mails.assertNotSent(CredentialChangedMail)
      assert.lengthOf(credentialLogs(captured.logs), 0)
    } finally {
      captured.restore()
    }
  })

  test('el rebote del buzón anterior no impide avisar al correo nuevo', async ({
    client,
    assert,
  }) => {
    const w = world!
    const previousEmail = `rebote-${stamp()}@correo.com`
    const newEmail = `recibe-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, previousEmail)
    const affected = await createUserFor(
      w.registry,
      person,
      w.full.role,
      [w.full.businessUnit],
      { userEmail: previousEmail, userEmailType: 'personal' }
    )
    const attempted: string[] = []
    const mailSender = mail as unknown as MailSender
    const originalSend = mailSender.send
    const loggerOwner = logger as unknown as LoggerOwner
    const originalInfo = loggerOwner.info
    let counter: Record<string, unknown> | undefined
    mailSender.send = async (mailMessage) => {
      const candidate = mailMessage as { params: { to: string } }
      attempted.push(candidate.params.to)
      if (candidate.params.to === previousEmail) throw new Error('Buzón anterior rechazado')
      return undefined
    }
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }
    try {
      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: newEmail })
      )

      response.assertStatus(201)
      assert.deepEqual(attempted, [previousEmail, newEmail])
      assert.isFalse(counter?.notified)
      assert.isTrue(counter?.logged)
      const userRow = await readUserRow(affected.userId)
      assert.equal(userRow.user_email, newEmail)
    } finally {
      mailSender.send = originalSend
      loggerOwner.info = originalInfo
    }
  })

  test('dos cambios institucionales conservan a victima@personal entre los destinatarios', async ({
    client,
    assert,
  }) => {
    const w = world!
    const fake = mail.fake()
    const personalEmail = 'victima@personal'
    const firstEmail = `primero-${stamp()}@empresa.com`
    const secondEmail = `segundo-${stamp()}@empresa.com`
    const initialEmail = `inicial-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personalEmail)
    const employee = await createEmployeeFor(
      w.registry,
      person,
      w.full.businessUnit,
      initialEmail
    )
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: initialEmail,
      userEmailType: 'institutional',
    })

    const first = await client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, { employeeBusinessEmail: firstEmail }))
    first.assertStatus(201)
    const sentBeforeSecond = fake.mails.sent().length
    employee.employeeBusinessEmail = firstEmail

    const second = await client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, { employeeBusinessEmail: secondEmail }))

    second.assertStatus(201)
    const secondBatch = fake.mails.sent().slice(sentBeforeSecond)
    assert.isTrue(secondBatch.some(({ message }) => message.hasTo(personalEmail)))
    assert.isTrue(secondBatch.some(({ message }) => message.hasTo(secondEmail)))
  })

  test('el titular conserva solo el token de la petición en curso', async ({ client, assert }) => {
    const w = world!
    w.full.user.userEmailType = 'personal'
    await w.full.user.save()
    await createSessions(w.full.user)

    const response = await client
      .put(`/api/users/${w.full.user.userId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(userBody(w.full.user, { userEmail: `titular-${stamp()}@correo.com` }))

    response.assertStatus(201)
    assert.equal(await tokenCount(w.full.user.userId), 1)
  })

  test('un fallo de correo deja notified false y conserva el éxito HTTP', async ({
    client,
    assert,
  }) => {
    const w = world!
    const email = `fallo-correo-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: email,
      userEmailType: 'personal',
    })
    const mailSender = mail as unknown as MailSender
    const originalSend = mailSender.send
    const loggerOwner = logger as unknown as LoggerOwner
    const originalInfo = loggerOwner.info
    let counter: Record<string, unknown> | undefined
    mailSender.send = async () => {
      throw new Error('SMTP no disponible')
    }
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }
    try {
      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: `nuevo-${stamp()}@correo.com` })
      )

      response.assertStatus(201)
      assert.isFalse(counter?.notified)
      assert.isTrue(counter?.logged)
    } finally {
      mailSender.send = originalSend
      loggerOwner.info = originalInfo
    }
  })

  test('un fallo de registro deja logged false y conserva el éxito HTTP', async ({
    client,
    assert,
  }) => {
    const w = world!
    const email = `fallo-registro-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: email,
      userEmailType: 'personal',
    })
    const logWriter = UserService.prototype as unknown as LogWriter
    const originalSave = logWriter.saveActionOnLog
    const loggerOwner = logger as unknown as LoggerOwner
    const originalInfo = loggerOwner.info
    let counter: Record<string, unknown> | undefined
    logWriter.saveActionOnLog = async () => {
      throw new Error('Registro no disponible')
    }
    loggerOwner.info = (data) => {
      counter = data as Record<string, unknown>
    }
    try {
      const response = await putPerson(
        client,
        person.personId,
        personBody(person, { personEmail: `nuevo-${stamp()}@correo.com` })
      )

      response.assertStatus(201)
      assert.isTrue(counter?.notified)
      assert.isFalse(counter?.logged)
    } finally {
      logWriter.saveActionOnLog = originalSave
      loggerOwner.info = originalInfo
    }
  })
})
