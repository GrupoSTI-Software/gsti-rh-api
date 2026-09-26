# Principios de diseño — DRY, KISS, YAGNI, acoplamiento

Complementan SOLID. Fuente de verdad: `00-brain/07-estandar-tecnico/09-principios-diseno.md`. Aplican a todo código nuevo y a todo código generado con IA.

- **DRY** — cada regla de negocio, constante, fórmula o validación tiene UNA representación autoritativa; los consumidores la importan, nunca la copian. Matiz: aplica a conocimiento, no a texto parecido — regla de tres (1ª vez se escribe, 2ª se tolera la duplicación, a la 3ª repetición real se extrae). No fusionar parecidos casuales en abstracciones forzadas.
- **KISS** — la solución más simple que resuelve el problema real. Sin capas, patrones ni abstracciones que el problema todavía no pide. Si la solución requiere descifrarse para entenderse, está mal aunque funcione.
- **YAGNI** — solo se construye lo que la HU pide HOY. Sin parámetros "por si acaso", flags sin consumidor ni generalización especulativa. Lo estructural estándar (tipado estricto, validación de entrada, seguridad, .env) NO es especulación: siempre va.
- **Bajo acoplamiento / alta cohesión** — depender de contratos (interfaces), no de implementaciones concretas; dependencias inyectadas desde afuera, nunca instanciadas dentro del consumidor. Cada módulo hace UNA cosa clara y todo su contenido sirve a esa cosa.

**Regla IA.** Al generar código con IA se pide explícitamente lo más simple y desacoplado que resuelva el problema; la sobre-ingeniería (capas, opciones y abstracciones no pedidas) se rechaza en review como violación de KISS/YAGNI.

**En este repo (AdonisJS).** Las reglas de negocio y constantes viven en services/dominio — nunca repetidas entre controllers, validators y jobs. Controllers delgados que orquestan; la lógica no se duplica entre endpoints que "se parecen". Dependencias vía el IoC de Adonis (`@inject`), no `new` dentro del consumidor. Un archivo de rutas por dominio (ya estándar del repo). Formatos de respuesta, cifrados o exportaciones "para el futuro" no entran sin HU.
