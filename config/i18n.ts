import app from '@adonisjs/core/services/app'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, formatters, loaders } from '@adonisjs/i18n'

const appRootPath = fileURLToPath(app.appRoot)
const i18nConfig = defineConfig({
  defaultLocale: 'es',
  supportedLocales: ['es', 'en'],
  formatter: formatters.icu(),

  loaders: [
    loaders.fs({
      location: join(appRootPath, 'resources', 'langs'),
    }),
  ],
})

export default i18nConfig