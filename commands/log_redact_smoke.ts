import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import logger from '@adonisjs/core/services/logger'
import { Writable } from 'node:stream'
import { pino } from 'pino'
import type { Logger } from 'pino'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from '#constants/log_redact_paths'

type CapturedLog = Record<string, unknown>

type SmokeResult = {
  name: string
  ok: boolean
  detail: string
}

function createCaptureLogger() {
  const chunks: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })

  const captureLogger: Logger = pino(
    {
      level: 'info',
      redact: {
        paths: [...LOG_REDACT_PATHS],
        censor: LOG_REDACT_CENSOR,
      },
    },
    destination
  )

  return {
    logger: captureLogger,
    readLine: () =>
      new Promise<CapturedLog>((resolve, reject) => {
        captureLogger.flush((flushError?: Error) => {
          if (flushError) {
            reject(flushError)
            return
          }
          resolve(JSON.parse(chunks.join('')) as CapturedLog)
        })
      }),
  }
}

function makeAxiosError(): AxiosError {
  const headers = new AxiosHeaders({
    Authorization: 'Bearer top-secret-token',
    'Content-Type': 'application/json',
  })

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

function makeDatabaseError() {
  return Object.assign(
    new Error("Duplicate entry 'ana@correo.com' for key 'users.user_email'"),
    {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sql: 'insert into `users` (`user_email`) values (?)',
      bindings: ['ana@correo.com'],
      sqlMessage: "Duplicate entry 'ana@correo.com' for key 'users.user_email'",
    }
  )
}

function makeMailError() {
  return Object.assign(new Error('all recipients were rejected'), {
    code: 'EENVELOPE',
    responseCode: 550,
    command: 'RCPT TO',
    rejected: ['user@empresa.mx'],
    rejectedErrors: [{ recipient: 'user@empresa.mx', response: '550 rejected' }],
  })
}

export default class LogRedactSmoke extends BaseCommand {
  static commandName = 'log:redact-smoke'
  static description =
    'Emite errores de prueba al logger del API y verifica la redacción USRH1788551528000'

  static options: CommandOptions = {
    startApp: true,
  }

  private pushResult(results: SmokeResult[], name: string, ok: boolean, detail: string) {
    results.push({ name, ok, detail })
    if (ok) {
      this.logger.success(`${name}: ${detail}`)
    } else {
      this.logger.error(`${name}: ${detail}`)
    }
  }

  private async verifyAxiosRedaction(results: SmokeResult[]) {
    const { logger: captureLogger, readLine } = createCaptureLogger()
    const err = makeAxiosError()

    captureLogger.error({ err }, 'log:redact-smoke — axios')
    const line = await readLine()
    const serialized = JSON.stringify(line)
    const config = (line.err as Record<string, unknown>).config as Record<string, unknown>
    const headers = config.headers as Record<string, unknown>

    const ok =
      headers.Authorization === LOG_REDACT_CENSOR &&
      config.data === LOG_REDACT_CENSOR &&
      !serialized.includes('top-secret-token') &&
      !serialized.includes('trabajador@empresa.mx') &&
      config.url === 'https://relojes.example/sync'

    this.pushResult(
      results,
      'axios',
      ok,
      ok
        ? 'Authorization, data redactados; url/método visibles'
        : 'Faltó redactar credencial o cuerpo axios'
    )
  }

  private async verifyDatabaseRedaction(results: SmokeResult[]) {
    const { logger: captureLogger, readLine } = createCaptureLogger()
    const err = makeDatabaseError()

    captureLogger.error({ err }, 'log:redact-smoke — mysql')
    const line = await readLine()
    const errObj = line.err as Record<string, unknown>

    const ok =
      errObj.sql === LOG_REDACT_CENSOR &&
      errObj.bindings === LOG_REDACT_CENSOR &&
      errObj.code === 'ER_DUP_ENTRY'

    this.pushResult(
      results,
      'mysql',
      ok,
      ok ? 'sql y bindings redactados; code visible' : 'Faltó redactar sql o bindings'
    )
  }

  private async verifyMailRedaction(results: SmokeResult[]) {
    const { logger: captureLogger, readLine } = createCaptureLogger()
    const err = makeMailError()

    captureLogger.error({ err }, 'log:redact-smoke — nodemailer')
    const line = await readLine()
    const errObj = line.err as Record<string, unknown>

    const ok =
      errObj.rejected === LOG_REDACT_CENSOR &&
      errObj.rejectedErrors === LOG_REDACT_CENSOR &&
      errObj.code === 'EENVELOPE'

    this.pushResult(
      results,
      'nodemailer',
      ok,
      ok ? 'rejected y rejectedErrors redactados' : 'Faltó redactar destinatarios SMTP'
    )
  }

  private async emitToAppLogger() {
    this.logger.info('Emitiendo 3 líneas al logger app (revisa stdout / pino-pretty)...')

    logger.error({ err: makeAxiosError() }, 'log:redact-smoke — axios (logger app)')
    logger.error({ err: makeDatabaseError() }, 'log:redact-smoke — mysql (logger app)')
    logger.error({ err: makeMailError() }, 'log:redact-smoke — nodemailer (logger app)')

    this.logger.info(
      `Busca "${LOG_REDACT_CENSOR}" en Authorization, data, sql, bindings y rejected.`
    )
    this.logger.info('No debe aparecer top-secret-token, trabajador@empresa.mx ni ana@correo.com en esos campos.')
  }

  async run() {
    this.logger.info('Inicio: smoke de redacción de logs (USRH1788551528000)')

    const results: SmokeResult[] = []

    try {
      await this.emitToAppLogger()
      await this.verifyAxiosRedaction(results)
      await this.verifyDatabaseRedaction(results)
      await this.verifyMailRedaction(results)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Error ejecutando smoke: ${message}`)
      this.exitCode = 1
      return
    }

    const failed = results.filter((item) => !item.ok)
    if (failed.length > 0) {
      this.logger.error(`Smoke fallido: ${failed.length}/${results.length} escenarios`)
      this.exitCode = 1
      return
    }

    this.logger.success(`Smoke OK: ${results.length}/${results.length} escenarios redactan como se espera`)
  }
}
