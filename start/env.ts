/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_CONNECTION: Env.schema.string.optional(),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variables for configuring the mail package
  |----------------------------------------------------------
  */
  SMTP_HOST: Env.schema.string.optional(),
  SMTP_PORT: Env.schema.string.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring api host synchronization 
  |----------------------------------------------------------
  */
  API_BIOMETRICS_HOST: Env.schema.string.optional(),
  /*
  |----------------------------------------------------------
  | Variables for configuring MongoDB connection
  |----------------------------------------------------------
  */
  MONGODB_MODE: Env.schema.enum.optional(['atlas', 'server'] as const),
  MONGODB_STRING: Env.schema.string.optional(),
  MONGODB_HOST: Env.schema.string.optional(),
  MONGODB_PORT: Env.schema.number.optional(),
  MONGODB_USER: Env.schema.string.optional(),
  MONGODB_PASSWORD: Env.schema.string.optional(),
  MONGODB_DB_NAME: Env.schema.string.optional(),
  DB_NAME: Env.schema.string.optional(),
})
