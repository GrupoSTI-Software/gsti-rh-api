import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const user = env.get('SMTP_USERNAME')
const password = env.get('SMTP_PASSWORD')

/**
 * Las credenciales solo se envían cuando ambas están presentes.
 * Con variables vacías o ausentes el bloque `auth` se omite, evitando el
 * error `500 5.5.2 Syntax error` que produce Mailpit cuando recibe un
 * comando AUTH con credenciales vacías. (CA-4, USRH1787178944072)
 */
const hasCredentials = Boolean(user && password)

const mailConfig = defineConfig({
  default: 'smtp',

  /**
   * The mailers object can be used to configure multiple mailers
   * each using a different transport or same transport with different
   * options.
   */
  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST', 'smtp.gmail.com'),
      port: env.get('SMTP_PORT', 587),
      secure: env.get('SMTP_SECURE', 'false') === 'true',
      ignoreTLS: env.get('SMTP_IGNORE_TLS', 'false') === 'true',
      ...(hasCredentials ? { auth: { type: 'login' as const, user: user!, pass: password! } } : {}),
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
