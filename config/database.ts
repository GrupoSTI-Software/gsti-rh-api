import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'
import type { MysqlConfig } from '@adonisjs/lucid/types/database'

/**
 * Evita que knex interpole valores en `err.message` al fallar una consulta
 * (USRH1788551528000). Lucid no declara la llave en `MysqlConfig`; se tipa aparte.
 */
const mysqlConnection = {
  client: 'mysql2',
  connection: {
    host: env.get('DB_HOST'),
    port: env.get('DB_PORT'),
    user: env.get('DB_USER'),
    password: env.get('DB_PASSWORD'),
    database: env.get('DB_DATABASE'),
    timezone: 'Z', // Esto es para UTC
  },
  migrations: {
    // naturalSort compara los prefijos como numeros enteros: un timestamp en
    // microsegundos (16 digitos) resulta "mayor" que uno en milisegundos (13),
    // y Lucid ejecuta todas las de 16 digitos al final, fuera de su orden
    // cronologico real. El orden lexicografico si es el correcto, porque un
    // prefijo en microsegundos es el de milisegundos con tres digitos extra.
    naturalSort: false,
    paths: ['database/migrations'],
  },
  compileSqlOnError: false,
} satisfies MysqlConfig & { compileSqlOnError: false }

const dbConfig = defineConfig({
  connection: env.get('DB_CONNECTION', 'mysql'),
  connections: {
    mysql: mysqlConnection,
  },
})

export default dbConfig
