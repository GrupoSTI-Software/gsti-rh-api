# Prueba manual — Ver los activos asignados en la ficha del colaborador

**Estado: entregado el 9 de octubre de 2026 y pendiente del recorrido manual de una persona (quien lo escribió no lo camina).**

**Problema:** Recursos Humanos asigna activos, registra devoluciones y firma resguardos en **Activos e insumos**, pero siempre partiendo del activo: para saber qué tiene puesta una persona había que abrir cada activo y buscar en su resguardo. La ficha del colaborador no mostraba nada de sus activos, así que responder "¿qué trae este colaborador y qué devolvió?" obligaba a saltar de pantalla en pantalla.

**Solución:** la ficha del colaborador gana una sección **Activos**, de solo consulta, con dos bloques: **Activos vigentes** (lo que la persona tiene ahora, incluido lo que va en camino) y **Activos devueltos** (su histórico, con fecha y motivo). Los activos vigentes se ven con su folio, su tipo, su serie y sus características, el estado del resguardo (**firmado** o **sin firmar**) y el estado de la asignación (**Asignado** o **En envío**); los activos devueltos, con su tipo, su fecha de devolución y su motivo. Pulsar el nombre de un activo que sigue en el catálogo abre ese activo en Activos e insumos, en su pestaña de resguardo.

Ejemplo: es como la mochila de un estudiante. Antes, para saber qué llevaba tenías que abrir cada cuaderno y buscar en su hoja de préstamo. Ahora abres su ficha y ves de un vistazo el equipo que trae hoy, el que está por llegarle y lo que ya devolvió, con la nota de si firmó el vale.

## Glosario

- **Activo:** un bien concreto que la empresa le entregó a una persona (una laptop, un celular, un monitor), con su folio.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo "QA-ACT-LAP-01").
- **Serie:** el número de serie del aparato; algunos activos no lo tienen.
- **Tipo de activo:** la clase de bien de la que cuelga el activo (por ejemplo "Laptop QA Activos").
- **Resguardo:** el vale con el que la persona recibe el activo. Está **firmado** si ya se subió, y **sin firmar** si todavía no.
- **Vigente:** el activo que la persona tiene ahora, o que va en camino (**En envío**).
- **Devuelto:** el activo que la persona ya regresó; se guarda con su fecha y su motivo.
- **Estado del catálogo:** si el activo del inventario está **Inactivo**, **Extraviado** o **Dañado**, además de la asignación.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae los módulos **Empleados** y **Activos e insumos**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con los módulos **Empleados** y **Activos e insumos** disponibles.
- Las **dos cuentas** de la §2 (una ve la sección, la otra no).
- **Carla Soto Nava** (código de nómina `QA-EMP-03`), la colaboradora con activos: trae vigentes la **Laptop QA Activos** (folio `QA-ACT-LAP-01`, con resguardo firmado y sus características), el **Monitor QA Activos** (folio `QA-ACT-MON-01`, sin resguardo), la **Bocina QA Activos** (folio `QA-ACT-BOC-01`, en envío) y el **Proyector QA Activos** (folio `QA-ACT-PRO-01`, extraviado); y trae devueltos el **Celular QA Activos** (folio `QA-ACT-CEL-01`, motivo **Cambio de equipo**), el **Teclado QA Activos** (folio `QA-ACT-TEC-01`, motivo **Equipo con falla**, eliminado del catálogo) y la **Tablet QA Activos** (folio `QA-ACT-TAB-01`, motivo **Devolucion por cambio de area**).
- **Elena Vega Paz** (código de nómina `QA-EMP-05`), una colaboradora **sin ninguna asignación**.
- Un colaborador **dado de baja** (código de nómina `QA-BAJA-01`) que conserva un activo vigente y uno devuelto.

**Señal para reconocer lo nuestro:** los activos de esta prueba tienen folio `QA-ACT-…` y su tipo termina en `QA Activos`; cualquier otro activo de la empresa es de otra historia y no se toca.

Si el ambiente no puede traer alguno de estos estados, el escenario que depende de él se reporta como **no verificable aquí** (ver §7), no se inventan pasos.

## 2. Usuarios

Las dos cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Todas usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-employee-assets-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** | Escenarios 4.1 a 4.7 y 6.1 (ve la sección) |
| **B** | `qa-employee-assets-none@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados**, **sin** lectura de **Activos e insumos** | Escenario 5.1 (no ve la sección) |

Estado inicial y orden del recorrido: la sección es de **solo consulta**, así que recorrerla no cambia nada en la base. Aun así conviene hacerlo **en orden** (4.1 → 4.7, luego 5.1 y 6.1), porque los escenarios 4.2 a 4.5 se apoyan en la misma ficha del 4.1 y el 6.1 vuelve sobre ella.

Ambas cuentas pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**): el sembrador concede la lectura de ese módulo a todos los roles de QA, así que la sesión no empieza en un aviso de permisos.

## 3. Dónde probar

La sección vive dentro de la ficha del colaborador.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral entra a **Empleados**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

Para llegar a la ficha: menú lateral → **Empleados**; busca a la colaboradora por su código de nómina (por ejemplo `QA-EMP-03`) y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección nueva es **Activos**: está en el submenú lateral de la ficha, **al final, después de Expediente**, con el icono de un portátil.

URL directa de la sección: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets` (la dirección **no** lleva `/es`).

## 4. Con el Usuario A (lectura de Activos e insumos)

Entra con el Usuario A y elige la empresa **QA Fundadora**. Abre la ficha de la colaboradora que toque en cada escenario.

### 4.1 Ficha completa: vigentes y devueltos

Objetivo: comprobar que en la ficha de un colaborador con activos, la sección **Activos** aparece al final del submenú y muestra cada vigente con sus datos y el estado de su resguardo, y cada devuelto con su fecha y motivo, en el orden correcto.

1. Con el Usuario A, abre la ficha de **Carla Soto Nava** (`QA-EMP-03`), que trae la **laptop vigente con resguardo firmado** y activos devueltos.
2. En el submenú de la ficha, al final (después de **Expediente**), está la opción **Activos** con el icono de un portátil. Púlsala.
3. Aparece la card **Activos vigentes** (con su conteo **Total: …**) y, debajo, la card **Activos devueltos**.
4. En **Activos vigentes**, el renglón de la **Laptop QA Activos** (`QA-ACT-LAP-01`) muestra: su nombre, **Folio QA-ACT-LAP-01**, **Tipo: Laptop QA Activos**, **Serie SN-LAP-5440**, cada característica capturada como **Nombre: valor** (**Modelo: Latitude 5440**, **RAM en GB: 16**, **Tiene garantia: Sí** y **Ultimo mantenimiento: …**), **Asignado el …** (1 de agosto de 2026), el chip **Asignado** y el chip **Resguardo firmado**.
5. En **Activos devueltos**, el renglón del **Celular QA Activos** (`QA-ACT-CEL-01`) muestra: su nombre, **Tipo: Celular QA Activos**, **Devuelto el …** (**1 de septiembre de 2026**) y **Motivo: Cambio de equipo**, con su chip de resguardo.
6. El orden de **Activos devueltos** va del más reciente al más antiguo **por fecha de devolución** (no por fecha de asignación). La colaboradora trae **tres devueltos** y sus fechas invierten el orden por asignación, así que debe verse primero el **Celular QA Activos** (devuelto en septiembre de 2026), luego el **Teclado QA Activos** (julio de 2026) y al final la **Tablet QA Activos** (junio de 2026); por fecha de asignación el primero habría sido la **Tablet**.

Evidencia: una captura de la sección con las dos cards visibles (donde se lean los textos de los chips y "Motivo: …" en el devuelto) y una captura del orden de **Activos devueltos** con los tres renglones.

### 4.2 Resguardo sin firmar

Objetivo: comprobar que un activo vigente al que todavía no se le ha subido el resguardo muestra el chip **Resguardo sin firmar**, en lugar de "Resguardo firmado".

1. Con el Usuario A, abre la ficha de **Carla Soto Nava** (`QA-EMP-03`) y entra a **Activos**.
2. En **Activos vigentes**, busca el renglón del **Monitor QA Activos** (`QA-ACT-MON-01`), el activo que **no tiene resguardo cargado**.
3. Ese renglón muestra el chip **Resguardo sin firmar**; el renglón sigue en **Activos vigentes**, con sus datos y su chip de asignación **Asignado**.

Evidencia: una captura del renglón del monitor donde se lea **Resguardo sin firmar**.

### 4.3 En envío

Objetivo: comprobar que un activo que va en camino aparece entre los vigentes con el chip **En envío**.

1. Con el Usuario A, abre la ficha de **Carla Soto Nava** (`QA-EMP-03`) y entra a **Activos**.
2. En **Activos vigentes** (no en devueltos), el renglón de la **Bocina QA Activos** (`QA-ACT-BOC-01`) muestra el chip **En envío**.
3. El mismo renglón trae sus datos (folio, tipo, etc.) como cualquier vigente.

Evidencia: una captura del renglón con el chip **En envío**.

### 4.4 Extraviado y activo eliminado

Objetivo: comprobar que un activo con estado **Extraviado** sigue apareciendo con su chip y conserva su enlace, y que un activo **eliminado del catálogo** aparece con su nombre como texto, sin enlace.

1. Con el Usuario A, abre la ficha de **Carla Soto Nava** (`QA-EMP-03`) y entra a **Activos**.
2. En **Activos vigentes**, el renglón del **Proyector QA Activos** (`QA-ACT-PRO-01`) muestra, además de su chip de asignación **Asignado**, el chip **Extraviado**. Su nombre sigue siendo un enlace (color y subrayado de enlace al pasar el cursor).
3. En **Activos devueltos**, el renglón del **Teclado QA Activos** (`QA-ACT-TEC-01`), que fue **eliminado del catálogo**, muestra su nombre como **texto normal**, sin enlace; si pasas el cursor y pulsas, no navega a ninguna parte. El renglón conserva el tipo y la fecha de devolución que tenía.
4. **Negativo a comprobar a propósito:** el renglón eliminado no se puede abrir; el extraviado sí.

Evidencia: una captura del renglón con **Extraviado** (que se note que el nombre se ve como enlace) y una captura del renglón eliminado (que se note que su nombre es texto, sin enlace).

### 4.5 Enlace al activo

Objetivo: comprobar que al pulsar el nombre de un activo que sigue en el catálogo, se abre **Activos e insumos** con la ficha de ese activo en su pestaña de resguardo.

1. Con el Usuario A, en la ficha de **Carla Soto Nava** (`QA-EMP-03`), entra a **Activos**.
2. En **Activos vigentes**, pulsa el nombre de la **Laptop QA Activos** (`QA-ACT-LAP-01`).
3. La app navega a **Activos e insumos** y abre la ficha de ese activo. La pestaña **Resguardo** (junto a **Ficha** y **Valor**) es la que queda seleccionada.
4. En la barra de direcciones se lee la pantalla de activos con el activo y la pestaña en la dirección: `http://127.0.0.1:3000/supplies?activo=<número>&tab=resguardo` (la dirección **no** lleva `/es`).

Evidencia: una captura de la ficha del activo abierta en la pestaña **Resguardo** y una captura de la barra de direcciones con `activo=…&tab=resguardo`.

### 4.6 Colaborador nuevo, sin activos

Objetivo: comprobar que la ficha de un colaborador sin ninguna asignación muestra un solo aviso de que no tiene activos, y ninguna card de devueltos.

1. Con el Usuario A, abre la ficha de **Elena Vega Paz** (`QA-EMP-05`), la colaboradora **sin activos**.
2. Entra a **Activos**.
3. Se ve un aviso con **Sin activos asignados** y, debajo, **Los activos se asignan desde Activos e insumos y aparecen aquí.**
4. **Negativo a comprobar a propósito:** no aparece la card **Activos vigentes** ni la card **Activos devueltos**.

Evidencia: una captura de la sección con solo el aviso **Sin activos asignados**.

### 4.7 Colaborador dado de baja

Objetivo: comprobar que la ficha de un colaborador dado de baja sigue mostrando sus activos: lo que no ha devuelto y su histórico.

1. Con el Usuario A, en **Empleados** cambia el filtro de estado a **Bajas** y abre la ficha del colaborador **`QA-BAJA-01`**, que conserva activos.
2. Entra a **Activos**.
3. La sección aparece igual que en un colaborador vigente: se ven sus **Activos vigentes** (la **Laptop QA Activos**, folio `QA-ACT-BAJA-LAP`) y sus **Activos devueltos** (el **Monitor QA Activos**, folio `QA-ACT-BAJA-MON`, motivo **Cambio de equipo**).
4. **Negativo a comprobar a propósito:** la baja del colaborador no deja la sección vacía ni con un error.

Evidencia: una captura de la sección del colaborador dado de baja con sus vigentes y devueltos.

## 5. Con el Usuario B (sin lectura de Activos e insumos)

Cierra la sesión del Usuario A y entra con el Usuario B (`qa-employee-assets-none@gsti-tests.local`).

### 5.1 La sección no aparece y la URL directa no monta nada

Objetivo: comprobar que con un rol sin lectura de Activos e insumos la sección **Activos** no aparece en el submenú de la ficha, y que abrir su dirección directa no monta el panel ni pide datos.

1. Con el Usuario B, abre la ficha de **Carla Soto Nava** (`QA-EMP-03`) y mira su submenú.
2. **Negativo a comprobar a propósito:** en el submenú **no** está la opción **Activos**. No aparece deshabilitada, ni con un aviso, ni con un candado: simplemente no está (el submenú termina en **Expediente**).
3. Escribe en la barra de direcciones la dirección directa: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets`.
4. La página queda **vacía**: no aparecen las cards **Activos vigentes** ni **Activos devueltos**, ni el aviso **Sin activos asignados**, ni un mensaje de error. No se ve nada dentro de la sección.
5. Abre la pestaña de red del navegador (F12 → Red) y recarga esa dirección: **no sale ninguna petición** al servicio de activos del colaborador. La pantalla no consultó nada.

Evidencia: una captura del submenú sin la opción **Activos** (que se vea que termina en **Expediente**), una captura de la página vacía en la dirección directa y una captura de la pestaña de red al recargar, sin la petición de activos.

## 6. Responsivo

### 6.1 A 360 px

Objetivo: comprobar que a 360 px de ancho la sección no produce desplazamiento horizontal y que cada renglón apila en una sola columna el nombre, los metadatos y los chips, en ese orden.

1. Con el Usuario A, en la ficha de **Carla Soto Nava** (`QA-EMP-03`), entra a **Activos**.
2. Estrecha la ventana del navegador hasta unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido no se sale hacia los lados.
4. En cada renglón, el contenido queda **apilado en una sola columna**, en este orden de arriba a abajo: primero el nombre, luego los metadatos (**Folio …**, **Tipo: …**, **Asignado el …**) y al final los chips debajo de los metadatos.
5. **Contraste:** al ensanchar la ventana a un ancho de escritorio, cada renglón pasa a **dos columnas**, los datos a un lado y los chips al otro.

Evidencia: una captura a 360 px de ancho (que se vea la regla o el ancho en el modo dispositivo) y una captura del mismo renglón en ancho de escritorio para el contraste de dos columnas.

## 7. Lo que no se revisa aquí

Se declara no revisable desde el navegador y queda cubierto por las pruebas automatizadas del plan:

- **El rechazo del servidor cuando falta la lectura de Activos e insumos.** En pantalla solo se ve la ausencia de la sección (Escenario 5.1); que el servidor responda con su código y no consulte solo se ve por HTTP.
- **Un colaborador de otra empresa o inexistente.** No se puede provocar desde la ficha (la dirección usa el identificador del colaborador de la empresa en pantalla); que ambos casos den el mismo resultado sin distinguirse lo cubren las pruebas.
- **Una dirección con un identificador de colaborador inválido.** No se provoca desde la URL de la ficha; lo cubren las pruebas.
- **La minimización de la respuesta** (que no viajen el archivo del resguardo, fotos, rutas de almacenamiento ni el identificador de empresa). Por pantalla no se ve; lo cubren las pruebas.
- **Que la sección no escriba ni descargue nada.** Lo cubren las pruebas del código.
- **El estado de error con el botón Reintentar.** Hace falta un fallo del servidor que la base de prueba no produce: no hay pasos para apagar el servidor ni para simular el fallo.
- **Los bordes del orden de devueltos** (cuando la fecha de devolución no existe y se ordena por asignación, y los empates). El orden normal se ve en el Escenario 4.1; los bordes no son provocables desde el cliente.
- **Que un resguardo borrado cuente como sin firmar.** No se puede provocar desde el cliente; lo cubren las pruebas.
- **El formato de las características de tipo Sí/No y de fecha.** El ambiente trae las dos (**Tiene garantia: Sí** y **Ultimo mantenimiento: …** se ven en el Escenario 4.1); el formato interno de cada una lo cubren las pruebas.

## 8. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

- [ ] 4.1 La sección **Activos** está al final del submenú (tras **Expediente**); en la ficha de `QA-EMP-03`, la **Laptop QA Activos** muestra folio, tipo, serie, características, **Asignado el …**, **Asignado** y **Resguardo firmado**; el **Celular QA Activos** muestra **Devuelto el …**, **Motivo: Cambio de equipo** y su resguardo; el orden de devueltos es por fecha de devolución (Celular, Teclado, Tablet)
- [ ] 4.2 El **Monitor QA Activos** (`QA-ACT-MON-01`) muestra el chip **Resguardo sin firmar**
- [ ] 4.3 La **Bocina QA Activos** (`QA-ACT-BOC-01`) aparece en vigentes con el chip **En envío**
- [ ] 4.4 El **Proyector QA Activos** (`QA-ACT-PRO-01`) muestra el chip **Extraviado** y enlaza; el **Teclado QA Activos** (`QA-ACT-TEC-01`), eliminado, muestra su nombre como texto, sin enlace
- [ ] 4.5 Al pulsar el nombre de la **Laptop QA Activos** se abre **Activos e insumos** con su ficha en la pestaña **Resguardo** (`activo=…&tab=resguardo`)
- [ ] 4.6 La ficha de `QA-EMP-05` muestra **Sin activos asignados** y ninguna card de devueltos
- [ ] 4.7 La ficha de `QA-BAJA-01` (filtro **Bajas**) sigue mostrando sus vigentes y devueltos
- [ ] 5.1 Con el Usuario B, la opción **Activos** no está en el submenú y la URL directa deja la página vacía, sin petición al servicio
- [ ] 6.1 A 360 px no hay desplazamiento horizontal y cada renglón se apila en una sola columna: nombre, luego metadatos y al final los chips

Recorrido completo el ___ de ________ de 2026: cada casilla se marca **contra el objetivo de su escenario**, no contra "se hicieron los pasos".
