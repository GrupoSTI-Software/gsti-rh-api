import { test } from '@japa/runner'
import { Writable } from 'node:stream'
import { pino } from 'pino'
import type { Logger } from 'pino'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import dbConfig from '#config/database'
import loggerConfig from '#config/logger'
import {
  LOG_REDACT_CENSOR,
  LOG_REDACT_PATHS,
} from '#constants/log_redact_paths'

type CapturedLog = Record<string, unknown>

function createCaptureLogger(options?: { paths?: string[] }) {
  const chunks: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })

  const logger: Logger = pino(
    {
      level: 'info',
      redact: {
        paths: options?.paths ?? [...LOG_REDACT_PATHS],
        censor: LOG_REDACT_CENSOR,
      },
    },
    destination
  )

  return {
    logger,
    readLine: () =>
      new Promise<CapturedLog>((resolve, reject) => {
        logger.flush((flushError?: Error) => {
          if (flushError) {
            reject(flushError)
            return
          }
          resolve(JSON.parse(chunks.join('')) as CapturedLog)
        })
      }),
  }
}

function makeAxiosError(headerCasing: 'Authorization' | 'authorization'): AxiosError {
  const headers =
    headerCasing === 'Authorization'
      ? new AxiosHeaders({
          Authorization: 'Bearer top-secret-token',
          'Content-Type': 'application/json',
        })
      : ({
          authorization: 'Bearer top-secret-token',
          'Content-Type': 'application/json',
        } as unknown as InternalAxiosRequestConfig['headers'])

  const requestConfig = {
    url: 'https://relojes.example/sync',
    method: 'post',
    headers,
    data: JSON.stringify({ employees: [{ employeeId: 1, email: 'trabajador@empresa.mx' }] }),
  } as InternalAxiosRequestConfig

  return new AxiosError(
    'Request failed with status code 500',
    'ERR_BAD_RESPONSE',
    requestConfig,
    undefined,
    {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
      data: {},
    }
  )
}

function stripPinoMeta(line: CapturedLog): CapturedLog {
  const { level, time, pid, hostname, name, msg, ...rest } = line
  void level
  void time
  void pid
  void hostname
  void name
  void msg
  return rest
}

test.group('LOG_REDACT_PATHS — registro técnico (USRH1788551528000)', () => {
  test('T1: config/logger cablea la lista y el censor en loggers.app', ({ assert }) => {
    assert.deepEqual(loggerConfig.loggers.app.redact, {
      paths: [...LOG_REDACT_PATHS],
      censor: LOG_REDACT_CENSOR,
    })
  })

  test('T2: ruta inválida impide construir el logger; la lista del repo no lanza', ({
    assert,
  }) => {
    assert.doesNotThrow(() =>
      pino({
        redact: {
          paths: [...LOG_REDACT_PATHS],
          censor: LOG_REDACT_CENSOR,
        },
      })
    )

    assert.throws(
      () =>
        pino({
          redact: {
            paths: ['err.config.headers.**'],
            censor: LOG_REDACT_CENSOR,
          },
        }),
      /invalid path/
    )
  })

  test('T3: axios con Authorization redacta token y cuerpo; conserva diagnóstico', async ({
    assert,
  }) => {
    const { logger, readLine } = createCaptureLogger()
    const err = makeAxiosError('Authorization')

    logger.error({ err, rowNumber: 7 }, 'fallo sincronizando empleados')
    const line = await readLine()
    const errObj = line.err as Record<string, unknown>
    const config = errObj.config as Record<string, unknown>
    const headers = config.headers as Record<string, unknown>

    assert.equal(headers.Authorization, LOG_REDACT_CENSOR)
    assert.equal(config.data, LOG_REDACT_CENSOR)
    assert.equal(line.msg, 'fallo sincronizando empleados')
    assert.equal(line.rowNumber, 7)
    assert.equal(errObj.message, err.message)
    assert.equal(errObj.code, err.code)
    assert.equal(errObj.status, 500)
    assert.equal(config.url, 'https://relojes.example/sync')
    assert.equal(config.method, 'post')
    assert.equal(headers['Content-Type'], 'application/json')
    assert.isString(errObj.stack)
    assert.notInclude(JSON.stringify(line), 'top-secret-token')
    assert.notInclude(JSON.stringify(line), 'trabajador@empresa.mx')
  })

  test('T4: axios con authorization en minúsculas redacta el token', async ({ assert }) => {
    const { logger, readLine } = createCaptureLogger()
    const err = makeAxiosError('authorization')

    logger.error({ err }, 'fallo axios minusculas')
    const line = await readLine()
    const config = (line.err as Record<string, unknown>).config as Record<string, unknown>
    const headers = config.headers as Record<string, unknown>

    assert.equal(headers.authorization, LOG_REDACT_CENSOR)
    assert.notInclude(JSON.stringify(line), 'top-secret-token')
  })

  test('T5: consulta fallida redacta sql y bindings; conserva metadatos del error', async ({
    assert,
  }) => {
    const { logger, readLine } = createCaptureLogger()
    const err = Object.assign(new Error("Duplicate entry 'ana@correo.com' for key 'users.user_email'"), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sql: 'insert into `users` (`user_email`) values (?)',
      bindings: ['ana@correo.com'],
      sqlMessage: "Duplicate entry 'ana@correo.com' for key 'users.user_email'",
    })

    logger.error({ err, 'x-request-id': 'trace-123' }, 'fallo insert usuario')
    const line = await readLine()
    const errObj = line.err as Record<string, unknown>

    assert.equal(errObj.sql, LOG_REDACT_CENSOR)
    assert.equal(errObj.bindings, LOG_REDACT_CENSOR)
    assert.equal(errObj.code, 'ER_DUP_ENTRY')
    assert.equal(errObj.errno, 1062)
    assert.equal(errObj.message, err.message)
    assert.equal(line['x-request-id'], 'trace-123')
    assert.isString(errObj.stack)
  })

  test('T6: correo rechazado redacta rejected, rejectedErrors y recipient', async ({
    assert,
  }) => {
    const { logger, readLine } = createCaptureLogger()
    const envelopeError = Object.assign(new Error('all recipients were rejected'), {
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
      rejected: ['user@empresa.mx'],
      rejectedErrors: [{ recipient: 'user@empresa.mx', response: '550 rejected' }],
    })

    logger.error({ err: envelopeError, to: '***@empresa.mx' }, 'fallo envio acceso')
    const line = await readLine()
    const errObj = line.err as Record<string, unknown>

    assert.equal(errObj.rejected, LOG_REDACT_CENSOR)
    assert.equal(errObj.rejectedErrors, LOG_REDACT_CENSOR)
    assert.equal(line.to, '***@empresa.mx')
    assert.equal(errObj.code, 'EENVELOPE')
    assert.equal(errObj.responseCode, 550)
    assert.equal(errObj.command, 'RCPT TO')

    const { logger: loggerRecipient, readLine: readRecipient } = createCaptureLogger()
    const recipientError = Object.assign(new Error('recipient rejected'), {
      code: 'EENVELOPE',
      recipient: 'user@empresa.mx',
    })
    loggerRecipient.error({ err: recipientError })
    const recipientLine = await readRecipient()
    assert.equal((recipientLine.err as Record<string, unknown>).recipient, LOG_REDACT_CENSOR)
  })

  test('T7: logger hijo con campos ADMS no redacta identificadores operativos', async ({
    assert,
  }) => {
    const { logger, readLine } = createCaptureLogger()
    const child = logger.child({ request_id: 'req-adms-001' })

    child.info({
      err: { message: 'device timeout', stack: 'Error: device timeout\n    at ping' },
      requestId: 'req-adms-001',
      path: '/adms/ping',
      method: 'POST',
      ip: '192.168.10.44',
      employeeId: 42,
      to: '***@empresa.mx',
    })

    const line = await readLine()
    assert.notInclude(JSON.stringify(line), LOG_REDACT_CENSOR)
    assert.equal(line.request_id, 'req-adms-001')
    assert.equal(line.requestId, 'req-adms-001')
    assert.equal(line.path, '/adms/ping')
    assert.equal(line.method, 'POST')
    assert.equal(line.ip, '192.168.10.44')
    assert.equal(line.employeeId, 42)
    assert.equal(line.to, '***@empresa.mx')
  })

  test('T8: objeto sin rutas declaradas sale idéntico sin metadatos pino', async ({ assert }) => {
    const { logger, readLine } = createCaptureLogger()
    const payload = {
      jobId: 3,
      reason: 'timeout',
      nested: { ok: true },
    }

    logger.warn(payload)
    const line = await readLine()
    assert.deepEqual(stripPinoMeta(line), payload)
    assert.notInclude(JSON.stringify(line), LOG_REDACT_CENSOR)
  })

  test('T9: conexión mysql declara compileSqlOnError en false', ({ assert }) => {
    const mysql = dbConfig.connections.mysql
    if (!('compileSqlOnError' in mysql)) {
      assert.fail('La conexión mysql debe declarar compileSqlOnError')
      return
    }
    assert.equal(mysql.compileSqlOnError, false)
  })
})
