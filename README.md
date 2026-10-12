# Vikingos Classic Bogotá

Sitio estático para presentar el evento Vikingos Classic 2026, recibir inscripciones y administrar competidores y clasificaciones desde el panel de jueces.

## Estructura del repositorio

```text
index.html                    Portada, inscripción y panel de jueces
styles.css                    Estilos del formulario y del panel
script.js                     Navegación, inscripciones, Supabase y clasificaciones
assets/                        Imágenes, logos, pagos y video
categorias/                    Imágenes de categorías y divisiones
galeria/                       Fotos y videos de la galería
reglamento/                    Imágenes del reglamento
legacy/index.js                Implementación anterior, no cargada por el sitio actual
tools/remove_emojis.py         Utilidad manual para quitar emojis del código
supabase-security-hardening.sql Políticas de acceso para Supabase
_redirects                    Redirección del dominio netlify.app al dominio público
```

La portada usa estilos y algunos manejadores directamente en `index.html`. El formulario y el panel usan `styles.css` y `script.js`. Las carpetas `categorias/`, `galeria/` y `reglamento/` ya separan los medios por función. El sitio no tiene paso de compilación ni dependencias npm: Netlify sirve los archivos estáticos.

## Páginas y recorridos

- **Portada pública:** `index.html` presenta el evento, las categorías, la galería, el reglamento y la información de inscripción.
- **Formulario propio:** el botón «Acceder al formulario» abre la vista de inscripción incluida en el mismo `index.html`. El formulario guarda competidores en Supabase y sube archivos al bucket privado `inscripciones`.
- **Formulario de Google:** el botón «Inscríbete ahora» de la portada abre [`https://forms.gle/aFEUgWzPXxUtX6jh8`](https://forms.gle/aFEUgWzPXxUtX6jh8). El repositorio solo contiene el enlace; las preguntas y el destino de las respuestas se administran en Google Forms/Sheets.
- **Jueces:** el botón «Jueces» abre el inicio de sesión. Las cuentas usan Supabase Auth; el panel comprueba el permiso mediante la función RPC `es_juez`.

El formulario de Google y el formulario propio de la página son dos recorridos separados. Si se cambia cuál debe usar el público, actualizar el enlace o la acción correspondiente en `index.html`.

## Probar localmente

Abre el repositorio con VS Code y usa una extensión de servidor estático, como Live Server, o ejecuta desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

Visita `http://localhost:8000`. La página carga Google Fonts, SheetJS y el SDK de Supabase desde CDN, por lo que algunas funciones requieren internet.

## Supabase

- El proyecto, la URL y la clave publicable del navegador se configuran al inicio de `script.js`.
- La clave publicada en el cliente debe ser una clave **publishable/anon**. Nunca añadir una `service_role` o un secreto al código del navegador.
- Los registros se guardan en `public.competidores` y sus archivos en el bucket privado `inscripciones`.
- El panel requiere usuarios creados en Supabase Auth y permisos de juez reconocidos por `es_juez`.
- `supabase-security-hardening.sql` define políticas RLS y de Storage. Revisar los nombres de tablas, columnas, bucket y funciones con el esquema real antes de ejecutarlo en **Supabase → SQL Editor**.

**Cuidado con las pruebas:** `develop` actualmente comparte la configuración de Supabase del código de `main`. Mientras no se configure un proyecto de pruebas aparte, cualquier prueba que guarde, edite o borre datos puede afectar la base real.

## Ramas y publicación

- **`main`:** versión pública y lista para producción.
- **`develop`:** entorno de pruebas; parte de la misma versión que `main` y recibe cambios primero.
- Probar en `develop` y revisar el resultado antes de integrar los cambios en `main`.
- En Netlify, configurar `main` como rama de producción y `develop` para deploy previews. Confirmar esa configuración en el panel de Netlify; no se define en este repositorio.
- Después de integrar, publicar las ramas remotas para que GitHub/Netlify reciban los cambios.

El archivo `_redirects` redirige `vikingosclassic.netlify.app` a `vikingosclassic.com`.

## Archivos antiguos

`legacy/index.js` contiene una implementación anterior con identificadores HTML distintos. No está incluido por `index.html`; no editarlo para cambios del sitio actual. `tools/remove_emojis.py` modifica `index.html` y `script.js` directamente, así que no ejecutarlo sin hacer antes una copia de seguridad.
