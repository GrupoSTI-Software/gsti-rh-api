# Principios de diseño — DRY, KISS, YAGNI, acoplamiento

Complementan SOLID. Fuente de verdad: `00-brain/07-estandar-tecnico/09-principios-diseno.md`. Aplican a todo código nuevo y a todo código generado con IA.

- **DRY** — cada regla de negocio, constante, fórmula o validación tiene UNA representación autoritativa; los consumidores la importan, nunca la copian. Matiz: aplica a conocimiento, no a texto parecido — regla de tres (1ª vez se escribe, 2ª se tolera la duplicación, a la 3ª repetición real se extrae). No fusionar parecidos casuales en abstracciones forzadas.
- **KISS** — la solución más simple que resuelve el problema real. Sin capas, patrones ni abstracciones que el problema todavía no pide. Si la solución requiere descifrarse para entenderse, está mal aunque funcione.
- **YAGNI** — solo se construye lo que la HU pide HOY. Sin parámetros "por si acaso", flags sin consumidor ni generalización especulativa. Lo estructural estándar (tipado estricto, validación de entrada, seguridad, .env) NO es especulación: siempre va.
- **Bajo acoplamiento / alta cohesión** — depender de contratos (interfaces), no de implementaciones concretas; dependencias inyectadas desde afuera, nunca instanciadas dentro del consumidor. Cada módulo hace UNA cosa clara y todo su contenido sirve a esa cosa.

**Regla IA.** Al generar código con IA se pide explícitamente lo más simple y desacoplado que resuelva el problema; la sobre-ingeniería (capas, opciones y abstracciones no pedidas) se rechaza en review como violación de KISS/YAGNI.

**En este repo (AdonisJS).** Las reglas de negocio y constantes viven en services/dominio — nunca repetidas entre controllers, validators y jobs. Controllers delgados que orquestan; la lógica no se duplica entre endpoints que "se parecen". Dependencias vía el IoC de Adonis (`@inject`), no `new` dentro del consumidor. Un archivo de rutas por dominio (ya estándar del repo). Formatos de respuesta, cifrados o exportaciones "para el futuro" no entran sin HU.

## Escalera antes de escribir código

Adoptada el 2026-10-04. Fuente: `00-brain/07-estandar-tecnico/09-principios-diseno.md` §5. La revisa `gsti-pre-review-pr` (categoría 6).

Primero se entiende el problema: la HU, su spec y el código que el cambio toca, con el flujo trazado de punta a punta. La escalera acorta la solución, nunca la lectura. Después, antes de escribir código nuevo, detente en el primer peldaño que resuelve:

1. **¿Hace falta?** Si la HU no lo pide, no se construye; dilo en una línea.
2. **¿Ya existe en este repo?** Helper, service, composable, validator, tipo o componente: se reutiliza. Busca antes de escribir (grep, `.gsti-kg/producto-mapa.md`). Reimplementar lo que vive a tres archivos es el error más común del código generado con IA.
3. **¿Lo resuelve la librería estándar?** Úsala.
4. **¿Lo resuelve el framework, la plataforma o la base de datos?** Úsalo (ver "Nativo primero en este repo").
5. **¿Lo resuelve una dependencia ya instalada?** Úsala. No agregues una dependencia nueva para lo que resuelven unas cuantas líneas; una nueva se justifica en la HU.
6. **Solo entonces**, el mínimo código que cumple la HU y el estándar.

**Bug = causa raíz, no síntoma.** Antes de editar una función, busca todos sus llamadores. Si la falla vive en la función compartida, corrígela una vez ahí, no con un guard en cada llamador ni solo en el camino que nombra el reporte.

**Atajos deliberados se declaran.** Una simplificación con techo conocido (escaneo O(n²), límite fijo, heurística ingenua, bloqueo global) se anota en el PR y en la HU como deuda declarada, con su techo y cuándo se mejora.

**La escalera no toca la estructura del estándar.** No son sobreingeniería, y prevalecen sobre "menos código": puertos y adaptadores de la arquitectura hexagonal (un puerto con un solo adaptador es lo normal), un archivo por caso de uso y sus rutas, la separación de archivos de este repo, errores título/detalle/key, i18n en ambos idiomas, validación en fronteras de confianza, seguridad, manejo de errores que evita pérdida de datos, accesibilidad y las pruebas que exige el repo. La escalera recorta lo especulativo, nunca lo estructural.

**Nativo primero en este repo (AdonisJS 6).** Validación de entrada con VineJS; paginación, precarga de relaciones y transacciones con Lucid, no con loops ni consultas armadas a mano; rate limiting con `@adonisjs/limiter`; trabajo diferido con `adonisjs-queue` y `adonisjs-scheduler`; identificadores y tokens con `node:crypto` (`randomUUID`, `randomBytes`), nunca `Math.random`; fechas con Luxon. La integridad (unicidad, referencias) la garantiza una restricción de BD; la validación de VineJS da el error título/detalle/key, no sustituye la restricción. No se agrega otra librería de fechas, HTTP, UUID o PDF: ya hay una instalada para cada cosa.
