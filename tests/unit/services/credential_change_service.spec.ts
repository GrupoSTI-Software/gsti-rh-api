import { test } from '@japa/runner'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Server } from 'socket.io'
import ApiToken from '#models/api_token'
import User from '#models/user'
import Ws from '#services/ws'
import logger from '@adonisjs/core/services/logger'
import UserService from '#services/user_service'
import {
  notifyAndAudit,
  revokeSessions,
  type NotifyAndAuditParams,
} from '#services/credential_change_service'

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
  }
  let originalIo: Server | undefined
  let originalSaveActionOnLog: typeof userServicePrototype.saveActionOnLog
  let originalLoggerInfo: typeof loggerOwner.info

  group.each.setup(() => {
    originalIo = Ws.io
    originalSaveActionOnLog = userServicePrototype.saveActionOnLog
    originalLoggerInfo = loggerOwner.info
  })

  group.each.teardown(() => {
    Ws.io = originalIo
    userServicePrototype.saveActionOnLog = originalSaveActionOnLog
    loggerOwner.info = originalLoggerInfo
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

  test('un fallo del asiento no se relanza y deja logged false sin correos en logger', async ({
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
})
