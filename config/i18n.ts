import app from '@adonisjs/core/services/app'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, formatters, loaders } from '@adonisjs/i18n'

const appRootPath = fileURLToPath(app.appRoot)
const i18nConfig = defineConfig({
  defaultLocale: 'en',
  formatter: formatters.icu(),

  loaders: [
    /**
     * The fs loader will read translations from the
     * "resources/lang" directory.
     *
     * Each subdirectory represents a locale. For example:
     *   - "resources/lang/en"
     *   - "resources/lang/fr"
     *   - "resources/lang/it"
     */
    
    loaders.fs({
      location: join(appRootPath, 'resources', 'langs')
    }),
  ],
})

export default i18nConfig