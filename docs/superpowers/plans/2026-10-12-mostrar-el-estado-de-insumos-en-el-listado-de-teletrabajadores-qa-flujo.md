# Prueba manual — El estado de insumos en el listado de teletrabajadores

**Estado: entregado el 13 de octubre de 2026; el recorrido manual lo hace quien lo recibe y las casillas del checklist se marcan al caminarlo.**

**Problema:** la NOM-037 obliga a la empresa a llevar el listado de teletrabajadores (apartado 5.1) y a vigilar que a cada uno se le entregue la **silla ergonómica**, el **equipo de cómputo o impresión** y los **aditamentos** (apartado 5.7). El listado ya existía, pero no decía nada de ese cumplimiento: para saber a quién le faltaba un insumo había que abrir la ficha del colaborador, uno por uno, y ahí recién verlo.

**Solución:** el listado **Teletrabajadores** gana una columna **Insumos** a la derecha de **% de teletrabajo**, con chips que resumen el estado de cada uno: **Completo** cuando no falta nada ni hay entregas en camino, y si no **N sin cubrir** y/o **N en envío**, más **N resguardo(s) sin firmar** cuando hay activos entregados sin su vale firmado. Además, el nombre del colaborador es un enlace a la sección **Activos** de su ficha, donde está el detalle. La columna de porcentaje pasó de llamarse **% remoto** a **% de teletrabajo**.

Ejemplo: es como el pizarrón de una escuela en la salida al campamento. La lista dice quién va, y antes para saber quién ya trajo su casco tenías que abrir su mochila uno por uno. Ahora, junto a cada nombre, hay una etiqueta: **Completo** si ya trae todo, o cuántas cosas le faltan y cuántas van en camino; y si tocas el nombre, ves el detalle de lo que lleva.

## Glosario

- **Insumo de teletrabajo:** bien que la empresa le entrega a quien trabaja desde casa porque la NOM-037 lo exige (silla ergonómica, equipo de cómputo o impresión, aditamentos).
- **Aditamento:** accesorio que complementa el puesto en casa (monitor, teclado, diadema, reposapiés). La norma no obliga a entregarlo, por eso nunca se marca como un faltante.
- **Resguardo:** el vale con el que la persona recibe un activo. Está **firmado** si ya se subió el documento, y **sin firmar** si todavía no.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo `QA-LST-ACT-SIL-01`).
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 (apartado 5.1) con los colaboradores activos cuyo teletrabajo representa el 40% o más de su jornada.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae el módulo **Empleados**, el módulo **Activos e insumos** y el módulo **Teletrabajadores**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con los tres módulos disponibles.
- Los **tipos de activo** con su categoría de la norma: **Silla QA Listado** (categoría *Silla ergonómica*) y **Computo QA Listado** (categoría *Equipo de cómputo o impresión*).
- Los **seis colaboradores** de la tabla de abajo: cinco se ven en el listado de **QA Fundadora** (códigos **971** a **975** de la columna **Código**) y el sexto (**976**) pertenece a la empresa ajena, donde el recorrido no llega (apartado 7).
- La **empresa ajena** **QA Listado Empresa**, con su propio teletrabajador (código **976**) y la membresía de la cuenta A en esa empresa; el aislamiento entre empresas no se recorre a mano (apartado 7).
- Las **tres cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba son los de la tabla de abajo; en el listado de **QA Fundadora** los reconoces por sus códigos en la columna **Código** (**971** a **975**), y sus activos llevan folio `QA-LST-ACT-…` con tipos de activo que terminan en **QA Listado**. La misma pantalla trae colaboradores de otras pruebas (**901**, **951**, **953**, **954**, **955**, **956**, **957** y **958**): esos no se tocan y sus chips no se marcan aquí. El único ajeno que sí se mira en este manual es **Ulises Pardo Gil** (Híbrido al 20%), que **no** aparece en el listado por no llegar al 40%.

Estado de cada colaborador (lo que deja el sembrador):

| Código (columna **Código**) | Nombre | Modalidad y % | Activos sembrados | Escenario |
|---|---|---|---|---|
| `971` | Ana Lira Soto | Home Office, 100% | Silla `QA-LST-ACT-SIL-01` y laptop `QA-LST-ACT-LAP-01` entregadas con resguardo firmado | 4.1 |
| `972` | Luis Bravo Cano | Híbrido, 60% | Solo silla `QA-LST-ACT-SIL-02` entregada con resguardo firmado | 4.2 |
| `973` | Marta Espino Gil | Home Office, 100% | Silla `QA-LST-ACT-SIL-03` entregada con resguardo firmado + laptop `QA-LST-ACT-LAP-02` en envío | 4.3 y 4.6 |
| `974` | Pedro Nava Rios | Home Office, 100% | Silla `QA-LST-ACT-SIL-04` entregada **sin** resguardo firmado + laptop `QA-LST-ACT-LAP-03` entregada con resguardo firmado | 4.4 |
| `975` | Sofia Ortega Luna | Híbrido, 40% | Ninguno | 4.5 |
| `976` | Bruno Ajeno Rios | Home Office, 100% (empresa **QA Listado Empresa**) | Ninguno | — no se recorre (apartado 7) |

Los códigos de arriba son los que muestra la columna **Código** del listado de teletrabajadores. La ficha del colaborador, a la que se entra desde **Empleados**, muestra el otro código del sembrador (`QA-LST-01`, `QA-LST-02`, …): es el mismo colaborador.

Orden del recorrido: los escenarios se recorren **en orden**. El listado es de solo consulta, así que recorrerlo no cambia nada y no hay que devolver ningún estado al terminar.

### Cómo se reporta

Cada escenario se marca **contra su `Objetivo:`**, no contra "se hicieron los pasos". Este manual **no pide capturas ni adjuntos**: el resultado esperado va escrito y quien recorre reporta lo que vio, con la cuenta y la empresa que usó. Lo que aparezca y sea de esta historia se corrige en esta misma rama; lo que sea de otra historia se anota en el apartado **9. Hallazgos de otras historias**, que es donde este manual deja su registro.

## 2. Usuarios

Las tres cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Todas usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-employee-assets-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** (ve la columna y el enlace) | Escenarios 4.1 a 4.6 y 6 |
| **B** | `qa-supplies-read@gsti-tests.local` | `password` | Backoffice | lectura de **Activos e insumos**, **sin** lectura de **Empleados** (ve la columna, no el enlace) | Escenario 5.1 |
| **C** | `qa-roles-none@gsti-tests.local` | `password` | Backoffice | **sin** lectura de **Activos e insumos** ni de **Empleados** (no ve la columna) | Escenario 5.2 |

Las tres entran al listado **Teletrabajadores**: el sembrador concede la lectura de ese módulo a todos los roles de QA, así que ninguna se detiene en un aviso de permisos. Las tres pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**), que no es donde se prueba.

Quién aparece en el listado (no cambia con esta historia): colaboradores **activos** de la **empresa activa**, con modalidad **Home Office** o **Híbrido** y **40% o más** de teletrabajo. Por debajo del 40%, presenciales o dados de baja, no aparecen.

## 3. Dónde probar

Se prueba en el listado **Empresa → Teletrabajadores**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral, grupo **Empresa**, entra a **Teletrabajadores**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

URL directa del listado: `http://127.0.0.1:3000/telework-workers` (la dirección **no** lleva `/es`).

Cómo se lee la tabla, de izquierda a derecha: **Empleado**, **Código**, **Puesto**, **Modalidad**, **% de teletrabajo**, **Insumos** y **Lugar donde labora**. La columna **Insumos** va justo a la derecha de **% de teletrabajo** y trae los chips de estado de cada colaborador. El nombre del colaborador es un enlace cuando la cuenta puede abrir su ficha. Arriba de la tabla hay un buscador **Buscar** (placeholder **Nombre del empleado o puesto**) y un contador de teletrabajadores.

---

## 4. Con el Usuario A (lectura de Empleados y de Activos e insumos)

Entra con el Usuario A (`qa-employee-assets-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

### 4.1 Colaborador con los insumos completos

Objetivo: comprobar que un teletrabajador con la silla y el equipo de cómputo entregados y sus resguardos firmados aparece en el listado con el chip **Completo**, y que la categoría de **Aditamento** —que sigue sin entregarse— no le suma ningún pendiente.

1. Con el Usuario A, abre **Empresa → Teletrabajadores**.
2. Busca en el buscador **Buscar** (placeholder **Nombre del empleado o puesto**) a **Ana Lira Soto** (código **971**; su aditamento sigue **Sin entregar**).
3. En su fila, mira la columna **Insumos**.
4. **Negativo a comprobar a propósito:** en su celda **no** aparece ningún chip de **sin cubrir**, **en envío** ni **resguardo sin firmar**.

**Qué debe verse:** la fila de **Ana Lira Soto** trae, en la columna **Insumos**, un único chip **Completo** (verde, de estado positivo). No aparecen los chips **N sin cubrir**, **N en envío** ni **N resguardo(s) sin firmar**. El aditamento **no** agrega ningún pendiente: la empresa no se lo ha entregado y sigue **Sin entregar**.

**Qué significa cada cosa que se ve:**

- **Insumos**: el encabezado de la columna nueva; resume el cumplimiento de insumos de teletrabajo del colaborador. Va a la derecha de **% de teletrabajo**.
- **Completo**: el colaborador está al corriente: no falta ninguna categoría obligatoria (silla y equipo de cómputo) ni hay nada en camino.
- **N sin cubrir**: cuántas categorías obligatorias (silla, equipo de cómputo) faltan y así cuentan como pendientes. El aditamento nunca entra en este conteo.
- **N en envío**: cuántas categorías obligatorias dependen de un activo que va en camino (todavía no está en manos de la persona).
- **N resguardo(s) sin firmar**: cuántos activos **ya entregados** tienen el resguardo sin firmar; puede aparecer junto a **Completo**.
- **Valores que la celda puede mostrar (todos):** **Completo**; **N sin cubrir**; **N en envío**; y **N resguardo(s) sin firmar** (este se cuenta aparte y puede acompañar a cualquiera de los otros). Los que llevan número se escriben en singular cuando el conteo es uno (**1 sin cubrir**) y en plural cuando es más (**2 sin cubrir**; **1 resguardo sin firmar** / **N resguardos sin firmar**).

### 4.2 Colaborador con un insumo sin cubrir

Objetivo: comprobar que a un teletrabajador al que se le entregó la silla pero le falta el equipo de cómputo, la columna **Insumos** dice cuántas categorías obligatorias quedan sin cubrir.

1. Con el Usuario A, busca a **Luis Bravo Cano** (código **972**, Híbrido al 60%) y mira su columna **Insumos**.
2. **Negativo a comprobar a propósito:** su celda **no** dice **Completo** y tampoco trae un chip de **en envío** (no hay nada en camino).

**Qué debe verse:** la celda **Insumos** de **Luis Bravo Cano** trae un solo chip **1 sin cubrir**. No dice **Completo** ni **en envío**.

(Lo que se ve es lo ya explicado en el Escenario 4.1: el conteo son las categorías obligatorias sin entregar; aquí el equipo de cómputo es la que falta.)

### 4.3 Colaborador con un insumo en envío

Objetivo: comprobar que un activo que va en camino no cuenta como entregado —se resume en el chip **N en envío**— y que mientras haya algo en camino la columna **nunca** dice **Completo**.

1. Con el Usuario A, busca a **Marta Espino Gil** (código **973**, Home Office al 100%; su laptop va en camino) y mira su columna **Insumos**.
2. **Negativo a comprobar a propósito:** su celda **no** dice **Completo**; y como la silla ya está entregada, tampoco dice **sin cubrir**.

**Qué debe verse:** la celda **Insumos** de **Marta Espino Gil** trae un solo chip **1 en envío**. No aparece **Completo** ni **sin cubrir**.

**Qué significa lo nuevo aquí:**

- **En envío** (el conteo): ese activo va en camino y todavía no está en manos de la persona, así que su categoría se sigue contando como pendiente; por eso, mientras haya algo en camino, **Completo** no aparece.

### 4.4 Resguardo sin firmar sobre insumos entregados

Objetivo: comprobar que un activo **ya entregado** cuyo resguardo todavía no se firma agrega el chip **1 resguardo sin firmar**, y que ese chip se muestra **junto a** **Completo** sin reemplazarlo.

1. Con el Usuario A, busca a **Pedro Nava Rios** (código **974**, Home Office al 100%; su silla está entregada sin el vale firmado) y mira su columna **Insumos**.

**Qué debe verse:** la celda **Insumos** de **Pedro Nava Rios** trae **dos** chips, uno junto al otro: **Completo** y **1 resguardo sin firmar**. El de resguardo **no** reemplaza a **Completo**: aparecen los dos.

**Qué significa lo nuevo aquí:**

- **Resguardo sin firmar**: la persona todavía no firmó el vale con el que responde por el activo. El activo **sí** está entregado (por eso no resta cobertura y sigue valiendo **Completo**), pero el papel queda pendiente.

### 4.5 El umbral exacto del 40%

Objetivo: comprobar que un colaborador híbrido justo en el **40%** —la frontera que lo mete al listado obligatorio— aparece en el listado con su estado de insumos.

1. Con el Usuario A, busca a **Sofia Ortega Luna** (código **975**, Híbrido al 40%, sin insumos) y mírala en la tabla.
2. Revisa su **Modalidad**, su **% de teletrabajo** y su columna **Insumos**.
3. **Negativo a comprobar a propósito:** **Ulises Pardo Gil** (Híbrido al 20%) **no** aparece en el listado, porque no llega al 40%.

**Qué debe verse:** **Sofia Ortega Luna** aparece en la tabla con **Modalidad** *Híbrido*, **% de teletrabajo** `40` y, en **Insumos**, el chip **2 sin cubrir** (no tiene ni silla ni equipo de cómputo entregados; el aditamento no cuenta). **Ulises Pardo Gil** (20%) no está en la lista.

**Qué significa lo nuevo aquí:**

- **% de teletrabajo** (el encabezado de la columna): el porcentaje de la jornada que la persona trabaja a distancia. Antes se llamaba **% remoto**. El listado incluye a quien llega **al 40% o más**.

### 4.6 Abrir la ficha del colaborador desde el listado

Objetivo: comprobar que el nombre del colaborador es un enlace que lleva a la sección **Activos** de su ficha, y que los estados que se ven ahí coinciden con el chip que mostraba la columna **Insumos** del listado.

1. Con el Usuario A, en el listado, localiza a **Marta Espino Gil** (código **973**) y anota su chip: **1 en envío**.
2. Pulsa su **nombre**.
3. La aplicación abre la sección **Activos** de su ficha. La dirección cambia a la de esa sección: empieza con `/employees/`, sigue el identificador del colaborador y termina en `/assets` (no lleva `/es`).
4. Arriba de la lista de activos está la tarjeta **Insumos de teletrabajo**, con sus tres categorías y sus chips de resumen.

**Qué debe verse:** se abre la sección **Activos** de la ficha de **Marta Espino Gil** (el enlace llevó al colaborador correcto, no a otro). En la tarjeta **Insumos de teletrabajo**:

- **Silla ergonómica** → chip **Entregado**, con el activo **Silla de oficina**, su **Folio QA-LST-ACT-SIL-03** y el chip **Resguardo firmado**.
- **Equipo de cómputo o impresión** → chip **En envío**, con el activo **Laptop de trabajo**, su **Folio QA-LST-ACT-LAP-02** y el chip **En envío**.
- **Aditamento** → chip **Sin entregar**, sin activos debajo.
- El resumen de la tarjeta dice **1 en envío**, el mismo estado que la columna **Insumos** del listado.

**Qué significa lo nuevo aquí** (los estados de la categoría que se ven en la ficha):

- **Entregado**: la empresa ya le entregó cuando menos un activo de esa categoría.
- **En envío**: lo tiene en camino; todavía no está en sus manos.
- **Equipo propio declarado**: lo cubre con su propio equipo porque la empresa así lo registró. Este estado **no se puede provocar** en el ambiente sembrado (ver el apartado 7); se lista aquí solo para que se sepa qué quiere decir.
- **Sin cubrir**: falta y así cuenta como pendiente.
- **Sin entregar**: no se le ha entregado; solo aplica al **Aditamento**, que la norma no exige.
- **Resguardo firmado**: la persona ya subió el vale con el que responde por el activo.

## 5. Con los Usuarios B y C (sin algún permiso)

### 5.1 Sin permiso de Empleados: la columna sí, el enlace no

Objetivo: comprobar que con un rol **sin lectura de Empleados** la columna **Insumos** sigue visible, pero el nombre del colaborador queda como texto y **no** lleva a ninguna ficha.

1. Cierra la sesión y entra con el **Usuario B** (`qa-supplies-read@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre **Empresa → Teletrabajadores**.
3. Mira la columna **Insumos** y trata de pulsar el **nombre** de un colaborador.

**Qué debe verse:** la columna **Insumos** aparece igual, con sus chips. El **nombre** es texto normal —sin subrayado ni apariencia de enlace— y al pulsarlo **no** navega a ninguna parte. El resto del listado funciona igual.

**Qué significa lo nuevo aquí:**

- Que el nombre deje de ser enlace: abrir la ficha exige la lectura de **Empleados**. Sin ese permiso, la columna de insumos se sigue viendo, pero el nombre se queda como texto.

### 5.2 Sin permiso de Activos e insumos: ni columna ni enlace

Objetivo: comprobar que con un rol **sin lectura de Activos e insumos** el listado se ve como antes de esta historia —sin la columna **Insumos** y sin enlace en el nombre— y que el dato de insumos ni siquiera llega al navegador.

1. Cierra la sesión y entra con el **Usuario C** (`qa-roles-none@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre las herramientas del navegador (F12) → pestaña **Red** (**Network**), marca **Conservar registro** (**Preserve log**) y recarga **Empresa → Teletrabajadores**.
3. En el **filtro** de esa pestaña escribe `telework-workers`. Quedarán tres peticiones: quédate con la del listado, la que en su dirección lleva **`nom037/telework-workers`** (las otras dos llevan `has-access`: son consultas de permiso). Púlsala.
4. Abre su pestaña **Respuesta** (**Response**). El cuerpo trae los colaboradores de la empresa (13 en esta siembra), uno por renglón, y **cada renglón trae solo estos siete datos**: `employeeId`, `employeeCode`, `fullName`, `position`, `workSchedule`, `teleworkPercentage` y `workplaces`. Así se ve un renglón real (el `employeeId` y el `position` cambian con cada siembra; el juego de claves es el mismo):

```json
{ "employeeId": 179, "employeeCode": "973", "fullName": "Marta Espino Gil", "position": "QA Puesto origen",
  "workSchedule": "Remote", "teleworkPercentage": 100, "workplaces": [] }
```

5. Comprueba que en **ningún** renglón aparezcan estas dos claves, que son las del dato de insumos:

   - **`employeeSlug`** — el identificador de la ficha del colaborador; se vería como un valor largo con guiones, del estilo `9f1c4a7e-8b2d-4c56-9f31-0a7b6d2e4c88`.
   - **`teleworkSuppliesSummary`** — el resumen de insumos; se vería como un grupo de conteos, del estilo `"uncoveredCount": 2`.

   La forma rápida: con la respuesta abierta, busca en la página (Ctrl/Cmd + F) las palabras `employeeSlug` y `teleworkSuppliesSummary`. Si alguna aparece, el dato viajó al navegador sin permiso.
6. Mira el listado en pantalla.

**Qué debe verse:** el listado se ve **como antes**: las columnas terminan en **% de teletrabajo** y siguen con **Lugar donde labora** (**no** aparece **Insumos**), y el **nombre** es texto, no enlace. En la **Red**, el cuerpo de la respuesta de **nom037/telework-workers** trae a cada colaborador solo con sus siete datos, y en ninguno aparecen las claves `employeeSlug` ni `teleworkSuppliesSummary`.

**Qué significa lo nuevo aquí:**

- Que la columna ni siquiera se arme: sin la lectura del módulo de insumos, el servidor **no manda** el resumen y la pantalla no dibuja columna ni enlace. No aparece deshabilitada ni con candado: simplemente no está, y el dato no viaja al navegador.

## 6. Anchos de pantalla

Objetivo: comprobar que el listado con la columna **Insumos** no se desborda a lo ancho en un teléfono (360 px) ni en un ancho intermedio, y que en escritorio se lee completo.

1. Con el Usuario A, en **QA Fundadora**, abre **Empresa → Teletrabajadores**.
2. Estrecha la ventana del navegador hasta unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido (tabla y chips) no se sale hacia los lados.
4. Ensancha la ventana a un **ancho intermedio, entre tableta y escritorio** (unos **850 px**).
5. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**).

**Qué debe verse:** a **360 px**, el listado **no** presenta desplazamiento horizontal; los chips de la columna **Insumos** envuelven en varias líneas dentro de su celda y nada se corta. A unos **850 px** tampoco hay desbordamiento y los chips se leen completos. Desde unos **1024 px** se ven todas las columnas, con **Insumos** a la derecha de **% de teletrabajo**.

(Lo que se ve es lo ya explicado en el Escenario 4.1.)

## 7. Escenarios que resuelven las pruebas automatizadas

Estos escenarios **no se recorren a mano**: el ambiente de prueba no los puede provocar. Los resolvieron las pruebas automatizadas de esta historia, y se documentan aquí con la misma forma de los demás.

### 7.1 El chip «Equipo propio declarado»

Objetivo: comprobar que una categoría que el colaborador cubre con su propio equipo cuenta como cubierta y **no** suma pendientes en la columna **Insumos**.

**Qué debe verse:** la celda con el chip **Completo** —el equipo propio declarado no resta—; y en la ficha, esa categoría con su estado **Equipo propio declarado**.

**Qué pasó:** no se puede provocar en el ambiente sembrado: la función que declara el equipo propio llega con otra historia que todavía no está integrada, así que ninguna pantalla produce ese estado. Lo resuelve la prueba automatizada del resumen de insumos, que comprueba que el equipo propio declarado no resta de **Completo**.

### 7.2 El error del listado

Objetivo: comprobar que, si algo falla al armar el listado, la pantalla avisa y ofrece **Reintentar**, sin mostrar detalles internos del sistema.

**Qué debe verse:** el aviso **No se pudo cargar el listado de teletrabajadores.** con el botón **Reintentar**, y ningún detalle interno del sistema en el mensaje.

**Qué pasó:** no se provoca desde la pantalla: por la política general del backoffice, un error del servidor lleva a la página de error de toda la aplicación, y detener el servicio no es algo que una persona de RH haga desde el navegador. Lo resuelven las pruebas automatizadas del listado: el mensaje de error y que no exponga el detalle interno.

### 7.3 El aislamiento entre empresas

Objetivo: comprobar que el listado y sus estados son **solo** de la empresa activa, sin mezclar colaboradores ni insumos de otra empresa.

**Qué debe verse:** con otra empresa activa, el listado trae únicamente a los colaboradores de esa empresa y a ninguno de **QA Fundadora**; y los insumos de una empresa nunca entran en el cálculo de la otra.

**Qué pasó:** no se recorre porque hoy cambiar de empresa termina en la pantalla 403 —un defecto ajeno a esta historia, explicado en el apartado 9—. Lo resuelve la prueba automatizada de aislamiento del API, que comprueba que el colaborador de otra empresa no aparece en el listado ni viaja al cálculo del resumen.

### 7.4 El idioma inglés del listado

Objetivo: comprobar que los textos de la pantalla —la columna **Insumos** y sus chips— existen también en inglés.

**Qué debe verse:** en inglés, la columna y los chips con su texto traducido.

**Qué pasó:** no se provoca desde la pantalla: el backoffice opera solo en español y reescribe cualquier dirección con otro idioma. Lo resuelven la paridad de claves de idioma de la pantalla y su lint.

**Checklist de estos escenarios** (se marca si la prueba automatizada pasó):

- [x] 7.1 La prueba del resumen pasa: el equipo propio declarado **no** resta de **Completo**
- [x] 7.2 La prueba del listado pasa: el error avisa con **Reintentar** y no expone detalle interno
- [x] 7.3 La prueba de aislamiento del API pasa: el colaborador de la otra empresa no aparece ni entra al cálculo
- [x] 7.4 El lint de claves de idioma pasa: cada clave de la pantalla existe en español y en inglés

Las cuatro pruebas están en verde en la corrida del **13 de octubre de 2026**: 17 casos del API, 18 del backoffice y el lint de claves de idioma limpio.

## 8. Checklist del recorrido manual

Cada casilla se marca **contra el objetivo de su escenario**, no contra "se hicieron los pasos":

- [x] 4.1 En Ana Lira Soto (`971`) la columna **Insumos** trae solo el chip **Completo**, aunque su aditamento siga **Sin entregar** (no suma pendientes)
- [x] 4.2 En Luis Bravo Cano (`972`) la columna dice **1 sin cubrir** y no **Completo** ni **en envío**
- [x] 4.3 En Marta Espino Gil (`973`) la columna dice **1 en envío** y **no** dice **Completo**
- [x] 4.4 En Pedro Nava Rios (`974`) la columna trae **Completo** **y** **1 resguardo sin firmar**, ambos chips
- [x] 4.5 Sofia Ortega Luna (`975`, Híbrido 40%) aparece en el listado con **% de teletrabajo** `40` y el chip **2 sin cubrir**; el 20% no aparece
- [x] 4.6 Pulsar el nombre de Marta Espino Gil (`973`) abre la sección **Activos** de su ficha y sus estados coinciden con el chip **1 en envío** del listado
- [x] 5.1 Con el Usuario B la columna **Insumos** se ve, pero el nombre no es enlace ni navega
- [x] 5.2 Con el Usuario C no hay columna **Insumos** ni enlace, y la respuesta del listado no trae el resumen de insumos
- [x] 6 A 360 px y a unos 850 px no hay desplazamiento horizontal y los chips no se salen; a unos 1024 px se ven todas las columnas

Recorrido completado el **13 de octubre de 2026**: las nueve casillas se marcaron **contra el objetivo de su escenario**, y nada quedó sin corregir en esta rama.

## 9. Hallazgos de otras historias

Defectos que **no son de esta historia**, aparecidos en cualquier momento del trabajo: al escribir el plan, al implementar, al redactar este manual, al recorrerlo o cuando quien lo pidió los reporte. No se corrigen en esta rama; su registro es este apartado.

### Cambiar de empresa deja al usuario en un 403

- **Qué se hizo:** con el Usuario A, en **QA Fundadora**, abrir **Empresa → Teletrabajadores** y en **Mi cuenta → Empresa** elegir **QA Listado Empresa**.
- **Qué se esperaba:** el listado de la empresa elegida, con sus propios colaboradores.
- **Qué pasó:** la aplicación recarga y muestra la pantalla **403 — «No tienes permiso para ver esto.»**; el recorrido se detiene ahí y la sesión queda en la empresa nueva. La aplicación pregunta por el permiso de un rol que no es el de la empresa elegida: la petición termina en `/api/roles/has-access/9/telework-workers/read` —ese `9` es el rol que la cuenta tiene en **QA Fundadora**, no el que tiene en **QA Listado Empresa**— y responde **403**, aunque la cuenta sí tiene esa lectura en la empresa elegida.
- **Dónde se vio:** en el listado de teletrabajadores, al cambiar la empresa activa desde **Mi cuenta** (el recorrido no puede continuar desde ahí).

Por este defecto, el aislamiento entre empresas no se recorre a mano: está declarado en el apartado 7 y lo cubre la prueba automática del API.

