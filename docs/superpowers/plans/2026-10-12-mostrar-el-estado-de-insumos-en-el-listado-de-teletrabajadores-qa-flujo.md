# QA Flujo — Mostrar el estado de insumos en el listado de teletrabajadores

**Qué se prueba:** el recorrido manual, en el navegador, del estado de insumos que aparece en el listado de teletrabajadores (**Empresa → Teletrabajadores**, ruta `/telework-workers`): la nueva columna **Insumos** (chips «Completo», «N sin cubrir», «N en envío» y «N resguardo(s) sin firmar»), el enlace del nombre del colaborador hacia la sección **Activos** de su ficha (`/employees/<slug>/assets`), y el respeto de los permisos de **Activos e insumos** y de **Empleados**, además del rótulo de porcentaje («% de teletrabajo») y su traducción al inglés.

**Alcance:** recorrido manual funcional, de interfaz y de permisos. No cubre rendimiento ni pruebas automatizadas.

**Antes de empezar:** entra a la aplicación con cada cuenta de prueba, abre **Empresa → Teletrabajadores** y ten a mano la consola del navegador (pestaña de red) para los escenarios que la piden. Para adjuntar la evidencia usa capturas de pantalla (y, cuando se indique, un archivo `.har` o una captura de la pestaña de red).

## Cuentas de prueba

Contraseña literal para las tres cuentas: `password`. Las tres pueden abrir **Empresa → Teletrabajadores**.

| Cuenta | Permiso de «Activos e insumos» | Permiso de «Empleados» | Qué se espera en el listado |
|---|---|---|---|
| `qa-employee-assets-full@gsti-tests.local` | Sí | Sí | Columna **Insumos** visible **y** nombre del colaborador como enlace a su sección Activos |
| `qa-supplies-read@gsti-tests.local` | Sí | No | Columna **Insumos** visible, pero el nombre es texto (sin enlace) |
| `qa-roles-none@gsti-tests.local` | No | No | Listado como hoy: **sin** columna **Insumos** y **sin** enlace |

> Nota: los colaboradores que deben aparecer en el listado son los activos con modalidad **Home Office** o **Híbrido** y 40% o más de teletrabajo, únicamente de la **empresa activa**. Con qué cuenta y en qué empresa se ve cada caso se indica en cada escenario.

---

## Escenario 1 — Colaborador con insumos completos

**Objetivo:** confirmar que un colaborador con todos los insumos entregados y los resguardos firmados, y sin aditamentos pendientes, muestra el chip «Completo».

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores** (`/telework-workers`).
3. Localiza el colaborador de prueba que tiene 100% de teletrabajo, con su **silla** y su **laptop** entregadas y sus resguardos firmados, y sin ningún aditamento declarado.
4. En la fila de ese colaborador, mira la columna **Insumos**.

**Resultado esperado:** la columna **Insumos** de esa fila muestra únicamente el chip **«Completo»**. No aparece ningún chip de «sin cubrir», «en envío» ni «resguardo sin firmar». El chip «Completo» se ve con la apariencia de estado positivo (color/estilo de completado) definida en el diseño.

**Evidencia:** captura de pantalla de la fila completa, con la columna **Insumos** legible y el chip «Completo» visible. Adjunta la captura al ticket.

---

## Escenario 2 — Colaborador con insumos sin cubrir

**Objetivo:** confirmar que un colaborador al que le falta un insumo (solo tiene la silla) muestra cuántos insumos quedan sin cubrir.

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Localiza el colaborador de prueba con 60% de teletrabajo, al que **solo se le ha entregado la silla** (le falta la laptop).
4. En su fila, mira la columna **Insumos**.

**Resultado esperado:** el chip de la columna **Insumos** dice **«1 sin cubrir»**. No dice «Completo» ni «en envío» (porque no hay ningún insumo en camino). El número refleja los insumos pendientes de entrega: en este caso, 1.

**Evidencia:** captura de pantalla de la fila mostrando el chip «1 sin cubrir» en la columna **Insumos**.

---

## Escenario 3 — Colaborador con un insumo en envío

**Objetivo:** confirmar que un insumo en camino aparece como «en envío» y que, mientras haya algo en envío, nunca se muestra «Completo».

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Localiza el colaborador de prueba cuya **laptop está en camino** (en envío).
4. En su fila, mira la columna **Insumos**.

**Resultado esperado:** el chip dice **«1 en envío»**. Aunque no haya insumos «sin cubrir», **no** aparece el chip «Completo», porque hay un insumo en tránsito. Si además hubiera insumos sin cubrir, se mostrarían ambos chips por separado (uno de «N sin cubrir» y otro de «N en envío»).

**Evidencia:** captura de pantalla de la fila con el chip «1 en envío», dejando claro que **no** aparece «Completo».

---

## Escenario 4 — Resguardo sin firmar sobre insumos ya entregados

**Objetivo:** confirmar que, aun con todos los insumos entregados, si un resguardo no está firmado aparece el chip «resguardo sin firmar» **además** de «Completo».

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Localiza el colaborador de prueba que tiene **todos sus insumos entregados**, pero con el **resguardo de la silla sin firmar**.
4. En su fila, mira la columna **Insumos**.

**Resultado esperado:** la fila muestra **dos** chips: **«Completo»** y **«1 resguardo sin firmar»**. El chip de resguardo aparece junto al de «Completo» (no lo reemplaza). Con más de un resguardo pendiente, el texto debe pluralizar correctamente: **«N resguardos sin firmar»**.

**Evidencia:** captura de pantalla de la fila mostrando ambos chips («Completo» y «1 resguardo sin firmar»).

---

## Escenario 5 — Equipo propio declarado

**Objetivo:** confirmar que un colaborador que usa su propio equipo (con declaración vigente) cuenta como cubierto y no resta para mostrar «Completo».

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Localiza el colaborador de prueba que **usa su propia silla** y tiene una **declaración de equipo propio vigente**.
4. En su fila, mira la columna **Insumos**.

**Resultado esperado:** la fila muestra **«Completo»**. El equipo propio declarado **cuenta como cubierto**, por lo que ese insumo no aparece como «sin cubrir» ni afecta el chip. (El equipo propio no genera un chip de resguardo pendiente.)

**Evidencia:** captura de pantalla de la fila con el chip «Completo» y, si es posible, una captura de la ficha del colaborador mostrando la declaración de equipo propio vigente, para dejar constancia del contexto.

---

## Escenario 6 — Umbral exacto del 40% de teletrabajo

**Objetivo:** confirmar que el criterio de aparición en el listado incluye exactamente el 40% de teletrabajo (y no solo valores por encima).

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Localiza el colaborador de prueba que tiene **exactamente 40%** de teletrabajo y modalidad Home Office o Híbrido, activo.
4. Verifica que aparece en el listado y revisa su columna **Insumos**.
5. Comprueba también el rótulo de la columna de porcentaje.

**Resultado esperado:** el colaborador con **40% exacto** **sí aparece** en el listado (el umbral incluye el 40%). La columna de porcentaje muestra el rótulo **«% de teletrabajo»** (ya no «% remoto»). Los colaboradores por debajo del 40%, o inactivos, o de modalidad distinta a Home Office/Híbrido, no aparecen.

**Evidencia:** captura de pantalla donde se vean el nombre del colaborador del 40%, el rótulo «% de teletrabajo» y su columna **Insumos**.

---

## Escenario 7 — Enlace del nombre hacia la sección Activos de la ficha

**Objetivo:** confirmar que el nombre del colaborador es un enlace a la sección **Activos** de su ficha y que los números coinciden con los de la columna **Insumos**.

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Toma nota del chip de la columna **Insumos** de un colaborador con al menos un insumo pendiente o en envío (por ejemplo, el del Escenario 2: «1 sin cubrir»).
4. Haz clic en el **nombre del colaborador**.
5. Observa a dónde navega y compara los datos de la ficha con lo que viste en el listado.

**Resultado esperado:** al hacer clic en el nombre se abre la **sección Activos de la ficha del colaborador** (ruta `/employees/<slug>/assets`, donde `<slug>` es el identificador del colaborador). Los números de esa sección (insumos cubiertos, sin cubrir, en envío y resguardos) **coinciden** con el resumen mostrado en la columna **Insumos** del listado. El nombre navega al colaborador correcto (no a otro).

**Evidencia:** captura del listado con el chip resaltado y captura de la sección Activos de la ficha destino, señalando la coincidencia de los números.

---

## Escenario 8 — Sin permiso de Activos e insumos

**Objetivo:** confirmar que, sin el permiso de **Activos e insumos**, el listado se ve como hoy (sin columna y sin enlace) y que el dato de insumos **no viaja al navegador**.

**Pasos:**
1. Entra con `qa-roles-none@gsti-tests.local` (contraseña `password`).
2. Abre la consola del navegador y ve a la pestaña de **red** (Network).
3. Recarga **Empresa → Teletrabajadores** (`/telework-workers`).
4. En la lista de peticiones, localiza la respuesta que alimenta el listado de teletrabajadores.
5. Inspecciona esa respuesta y busca cualquier resumen de insumos («sin cubrir», «en envío», «resguardo sin firmar», «Completo») o un identificador de ficha (`slug` del colaborador).
6. Mira el listado en pantalla.

**Resultado esperado:**
- El listado se ve **como hoy**: **no** aparece la columna **Insumos** y el **nombre no es enlace** (es texto).
- En la pestaña de red, la respuesta **NO trae el resumen de insumos** ni el **identificador de la ficha**: el dato de insumos **no se envía al navegador**. (Verifica buscando en el cuerpo de la respuesta; no debe aparecer.)

**Evidencia:** captura del listado sin la columna **Insumos** y captura de la pestaña de red mostrando el cuerpo de la respuesta sin el resumen de insumos ni el identificador. Si es posible, adjunta también un `.har` de la sesión.

---

## Escenario 9 — Sin permiso de Empleados (columna sí, enlace no)

**Objetivo:** confirmar que sin el permiso de **Empleados** la columna **Insumos** sigue visible, pero el nombre del colaborador queda como texto, sin enlace.

**Pasos:**
1. Entra con `qa-supplies-read@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores**.
3. Verifica que la columna **Insumos** aparece con sus chips.
4. Intenta hacer clic sobre el **nombre del colaborador** y observa el comportamiento (cursor, si navega o no).

**Resultado esperado:** la columna **Insumos** se muestra con normalidad (chips «Completo», «N sin cubrir», «N en envío», «N resguardo(s) sin firmar» según el caso). El **nombre es texto**, sin subrayado ni estilo de enlace, y **no navega** a ninguna ficha al hacer clic. El resto del listado funciona igual.

**Evidencia:** captura de la fila mostrando la columna **Insumos** presente y el nombre sin apariencia de enlace.

---

## Escenario 10 — Aislamiento entre empresas

**Objetivo:** confirmar que el listado y los estados de insumos corresponden únicamente a la **empresa activa** y no mezclan datos de otras empresas.

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre **Empresa → Teletrabajadores** con una empresa activa (Empresa A). Anota los colaboradores que aparecen y sus chips de **Insumos**.
3. Cambia la **empresa activa** a otra empresa (Empresa B) a la que tengas acceso.
4. Vuelve a **Empresa → Teletrabajadores** y compara.

**Resultado esperado:** con la Empresa B activa, el listado muestra **solo colaboradores de la Empresa B** (no aparecen los de la Empresa A) y los chips de **Insumos** corresponden a las fichas de esa empresa. Ningún estado de insumos de la Empresa A se filtra en la Empresa B. Al volver a la Empresa A, el listado y los estados vuelven a corresponder a esa empresa.

**Evidencia:** dos capturas (una por empresa) mostrando que los colaboradores y los chips de insumos son distintos y coherentes con la empresa activa. Anota el nombre de cada empresa en la evidencia.

---

## Escenario 11 — Error sin fuga de información

**Objetivo:** confirmar que, ante un fallo de la API (caída) o un token inválido, el listado muestra su error con opción de **Reintentar**, sin revelar detalles internos en el mensaje.

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`) y abre **Empresa → Teletrabajadores** para comprobar el estado normal.
2. Provoca el fallo de una de estas dos formas, según el entorno:
   - **API caída:** detén el servicio de la API (o desconéctate de la red) y recarga el listado.
   - **Token inválido:** invalida o expira el token de sesión (por ejemplo, cierra sesión en otro dispositivo o manipula la sesión) y recarga el listado.
3. Observa lo que muestra la pantalla del listado.
4. Lee con cuidado el **texto del mensaje de error**.
5. Pulsa **Reintentar** (con el servicio ya restablecido) y verifica que el listado se recupera.

**Resultado esperado:**
- El listado muestra un **estado de error** claro, con un botón **«Reintentar»**.
- El mensaje de error **no revela detalles internos**: no expone rutas internas, nombres de tablas o colecciones, códigos de excepción, trazas, ni identificadores técnicos del backend. Es un mensaje genérico y amigable para el usuario.
- Al restablecer el servicio y pulsar **«Reintentar»**, el listado carga normalmente.

**Evidencia:** captura de la pantalla de error (mostrando el botón «Reintentar» y el texto del mensaje) y captura del listado ya recuperado tras pulsar «Reintentar». Señala en la captura que el mensaje no contiene detalles internos.

---

## Escenario 12 — Responsivo a 360 px e idioma inglés

**Objetivo:** confirmar que el listado con la columna **Insumos** no genera desplazamiento horizontal a 360 px de ancho y que los rótulos se traducen en inglés.

**Pasos:**
1. Entra con `qa-employee-assets-full@gsti-tests.local` (contraseña `password`).
2. Abre las herramientas de desarrollo del navegador y activa el **modo dispositivo** (responsive) con un ancho de **360 px**.
3. Recarga **Empresa → Teletrabajadores** y revisa la pantalla completa.
4. Desplázate horizontalmente si es posible y observa si aparece barra de desplazamiento horizontal o contenido cortado.
5. Cambia el idioma de la aplicación a **inglés** (English).
6. Revisa los rótulos de la tabla y los chips de la columna **Insumos**.

**Resultado esperado:**
- A **360 px** de ancho, el listado **no presenta desplazamiento horizontal** (no hay barra inferior ni contenido que se salga del ancho de pantalla); las filas y los chips se ajustan al ancho disponible.
- En **inglés**, los rótulos se traducen: la columna de porcentaje se muestra como **«Telework %»**, la columna de insumos y los chips de estado aparecen en inglés (por ejemplo, «Complete», «N uncovered», «N in transit», «N acknowledgment unsigned») según las traducciones definidas. No quedan textos sin traducir ni claves crudas de i18n visibles.

**Evidencia:** captura a 360 px mostrando la ausencia de desplazamiento horizontal y captura en inglés donde se lean los rótulos traducidos («Telework %» y los chips de insumos).

---

## Cierre

Con los 12 escenarios recorridos y su evidencia adjunta, el manual queda completo. Si algún resultado no coincide con lo esperado, registra el escenario, la cuenta y la empresa usadas, los pasos exactos, el resultado observado frente al esperado y la evidencia correspondiente, y repórtalo como defecto.
