# Higiene del repositorio

## `node_modules` — intocable para agentes

Los agentes (Claude Code, Cursor o cualquier asistente de IA) no deben ni pueden modificar, crear ni renombrar archivos dentro de `node_modules/` ni de ningún directorio de dependencias instaladas.

- `node_modules/` es artefacto de instalación: se regenera con el package manager y cualquier edición manual se pierde en el siguiente install, creando divergencia silenciosa entre entornos.
- Un fix a una dependencia va por `package.json` (cambio de versión, `overrides`) o `patch-package` — nunca editando el paquete instalado.
- Sobre `node_modules/` solo se permite lectura (inspeccionar código de dependencias) y regeneración completa vía el package manager (`npm install`, `npm ci`).
- Única excepción: invalidar caches de build (`node_modules/.cache` y similares) cuando el usuario lo autorice explícitamente en la sesión.

## Retiro de archivos → `__TO_DELETE__/`

Nada se borra ni se renombra con prefijo. Todo archivo o carpeta que se retira del código se **mueve** a `__TO_DELETE__/` en la raíz del repo, conservando su ruta relativa original (sin prefijos): `app/modules/foo/foo.service.ts` → `__TO_DELETE__/app/modules/foo/foo.service.ts`. Willy revisa esa carpeta y la elimina desde Finder.

- Si el archivo está versionado, se mueve con `git mv` para conservar su historial. Si ya existe algo en el destino, se agrega un sufijo numérico (`-2`, `-3`).
- Antes de moverlo se cortan todos sus imports y referencias vivas. Nada dentro de `__TO_DELETE__/` se importa, se compila, se lintea ni se prueba: la carpeta está excluida de la herramienta del repo.
- Una carpeta que queda vacía por el retiro se mueve también.
- El prefijo `__DELETED__` queda obsoleto: no se usa en código nuevo. Si una rama integrada trae archivos `__DELETED__`, se mueven aquí al integrarla.
- La regla aplica a archivos y carpetas completos. Quitar código muerto dentro de un archivo que sigue en uso no es un retiro.
