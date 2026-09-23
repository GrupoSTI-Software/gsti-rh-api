import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Guardarraíl de los alias `#*` del proyecto.
 *
 * Adonis los declara como subpath imports en `package.json`, que es lo que Node
 * usa en ejecución. TypeScript los resuelve por esa vía gracias a
 * `module: NodeNext`, así que `tsc` compila aunque `tsconfig.json` no los
 * repita.
 *
 * El problema es todo lo demás. Editores y plugins que resuelven módulos leen
 * `compilerOptions.paths` y no los subpath imports: con la lista incompleta,
 * un `import ... from '#services/employee_service'` queda subrayado como módulo
 * inexistente aunque compile y corra. Eso llena el editor de falsos positivos y
 * entrena a ignorarlos, que es peor que no tenerlos.
 *
 * Las dos listas se declaran a mano en archivos distintos, así que se
 * desincronizan sin avisar: este spec exige que cada alias de `package.json`
 * tenga su entrada en `paths`, apuntando al mismo directorio.
 */

const ROOT = process.cwd()

/** Alias `#nombre/*` declarados como subpath imports de Node. */
function packageImports(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
  return pkg.imports ?? {}
}

/** Alias declarados para la resolución de TypeScript. */
function tsconfigPaths(): Record<string, string[]> {
  const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8')
  return JSON.parse(raw).compilerOptions?.paths ?? {}
}

/** Directorio al que apunta un destino, sin el comodín ni la extensión. */
function targetDir(target: string): string {
  return target.replace(/^\.\//, '').replace(/\/\*(\.js)?$/, '')
}

test.group('Alias del proyecto — package.json e tsconfig.json', () => {
  test('todo subpath import tiene su entrada en compilerOptions.paths', ({ assert }) => {
    const missing = Object.keys(packageImports()).filter((alias) => !(alias in tsconfigPaths()))

    assert.deepEqual(
      missing,
      [],
      'Los editores resuelven por `paths`: un alias ausente se subraya como módulo inexistente aunque compile'
    )
  })

  test('cada alias apunta al mismo directorio en los dos archivos', ({ assert }) => {
    const paths = tsconfigPaths()
    const mismatched = Object.entries(packageImports())
      .filter(([alias]) => alias in paths)
      .map(([alias, target]) => ({
        alias,
        node: targetDir(target),
        typescript: targetDir(paths[alias][0]),
      }))
      .filter((entry) => entry.node !== entry.typescript)

    assert.deepEqual(mismatched, [])
  })

  test('paths no inventa alias que Node no resuelve', ({ assert }) => {
    const imports = packageImports()
    const extra = Object.keys(tsconfigPaths()).filter((alias) => !(alias in imports))

    assert.deepEqual(
      extra,
      [],
      'Un alias solo en `paths` compila pero revienta en ejecución: Node no lo conoce'
    )
  })
})
