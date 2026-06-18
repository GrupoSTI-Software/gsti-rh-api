import { rm, access } from 'node:fs/promises'
import { execSync } from 'node:child_process'

// 1. Build normal de Adonis
execSync('node ace build', { stdio: 'inherit' })

// 2. Eliminar el módulo demo del bundle compilado
await rm('build/app/modules/demo', { recursive: true, force: true })
console.log('✓ Módulo demo removido del build de producción')

// 3. Verificación: si el módulo sigue ahí, fallar el build
try {
  await access('build/app/modules/demo')
  throw new Error('FALLO: build/app/modules/demo existe en bundle de producción')
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}
console.log('✓ Build prod validado: sin módulo demo')
