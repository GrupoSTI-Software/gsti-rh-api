import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * The bodyparser middleware will parse the request body
   * for the following HTTP methods.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser
   */
  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser
   *
   * `limit: '2mb'` (AdonisJS default is 1mb): varios endpoints envían texto
   * enriquecido en JSON con varios campos/componentes en el mismo request
   * (p. ej. `legal-documents` con `content.es`/`content.en` a 1 MB cada uno,
   * o `telework-policy` con 12 componentes de hasta 100 KB). Con el límite
   * default de 1mb, esos payloads ya válidos para los validadores de Vine
   * eran rechazados antes de llegar a ellos con un 413 "Entity too large"
   * genérico del framework.
   */
  json: {
    convertEmptyStringsToNull: true,
    limit: '2mb',
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Enabling auto process allows bodyparser middleware to
     * move all uploaded files inside the tmp folder of your
     * operating system
     */
    autoProcess: true,
    convertEmptyStringsToNull: true,
    processManually: [],

    /**
     * Maximum limit of data to parse including all files
     * and fields
     */
    limit: '20mb',
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
