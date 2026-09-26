import 'reflect-metadata'
import { Ignitor } from '@adonisjs/core'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const APP_ROOT = new URL('../', import.meta.url)
const ignitor = new Ignitor(APP_ROOT, { importer: (url) => import(url) })
await ignitor.tap((app) => {
  app.booting(async () => {
    await import('#start/env')
  })
}).httpServer().start()
