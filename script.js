// ====== SUPABASE CONFIGURACIÓN ======
const supabaseUrl = "https://djceavyhjkrqvsvellke.supabase.co";
const supabaseAnonKey = "sb_publishable_WT7LbFYCjIAWTo__N360KQ_Erdh1-Y8";

let supabaseClient = null;

// Estado de la conexión con la nube (se muestra en el panel de jueces)
function setEstadoNube(ok, detalle) {
  const el = document.getElementById('estadoNube');
  if (!el) return;
  el.classList.toggle('nube-ok', !!ok);
  el.classList.toggle('nube-error', !ok);
  el.title = detalle || (ok ? 'Conectado a la nube' : 'Sin conexión con la nube');
  const txt = document.getElementById('estadoNubeTexto');
  if (txt) txt.textContent = ok ? 'Nube conectada' : 'Nube sin conexión';
}

// Traduce los errores de Supabase a algo entendible
function mensajeErrorNube(error) {
  if (!error) return 'Error desconocido';
  const msg = error.message || String(error);
  if (error.code === 'PGRST204' || /column/i.test(msg)) return `La tabla de Supabase no tiene un campo que envía la página (${msg}).`;
  if (error.code === '42501' || /row-level security|permission/i.test(msg)) return 'Supabase no da permiso para guardar (revisar las políticas RLS de la tabla "competidores").';
  if (/payload|too large|413/i.test(msg)) return 'El archivo del comprobante es demasiado grande.';
  if (/fetch|network|Failed/i.test(msg)) return 'No hay conexión a internet o Supabase no responde.';
  return msg;
}

// Prepara el registro para la base de datos (N/A -> vacío en los números)
function paraSupabase(comp) {
  const { id, ...datos } = comp;
  ['peso', 'estatura'].forEach(k => {
    if (datos[k] === 'N/A' || datos[k] === '' || datos[k] === undefined) datos[k] = null;
  });
  return datos;
}

async function fetchAllFromSupabase() {
  if (!supabaseClient) { setEstadoNube(false, 'No cargó la librería de Supabase'); return false; }
  try {
    const { data, error } = await supabaseClient.from('competidores').select('*').order('id', { ascending: true });
    if (error) throw error;
    if (data) {
      saveCompetidores(data);
      loadCompetitors();
    }
    setEstadoNube(true);
    return true;
  } catch (err) {
    console.error("Error descargando de Supabase:", err);
    setEstadoNube(false, mensajeErrorNube(err));
    return false;
  }
}

// Guarda (o borra) un competidor en Supabase. Devuelve { ok, error }.
async function syncCompetidorToSupabase(comp, borrar = false) {
  if (!supabaseClient) {
    return { ok: false, error: 'No se pudo conectar con la base de datos (la librería de Supabase no cargó).' };
  }
  try {
    if (borrar) {
      const { error } = await supabaseClient.from('competidores').delete().eq('cedula', comp.cedula);
      if (error) throw error;
      return { ok: true };
    }
    const datos = paraSupabase(comp);
    const { data: existentes, error: errorBuscar } = await supabaseClient.from('competidores').select('id').eq('cedula', comp.cedula);
    if (errorBuscar) throw errorBuscar;

    const { error } = (existentes && existentes.length > 0)
      ? await supabaseClient.from('competidores').update(datos).eq('cedula', comp.cedula)
      : await supabaseClient.from('competidores').insert(datos);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("Error sincronizando competidor a Supabase:", err);
    const texto = mensajeErrorNube(err);
    setEstadoNube(false, texto);
    if (typeof showToast === 'function' && document.body.classList.contains('modo-panel')) {
      showToast(`No se guardó en la nube: ${texto}`, 'error');
    }
    return { ok: false, error: texto };
  }
}
// ===================================

let editMode = false;
let editId = null;

// Variables de estado para archivos del formulario de inscripción
let comprobanteArchivo = {
  dataUrl: null,   // vista previa
  blob: null,      // archivo que se sube a la nube
  nombre: '',
  tipo: ''
};

let musicaArchivo = {
  nombre: '',
  url: null,
  file: null
};

// ─── ARCHIVOS EN SUPABASE STORAGE ─────────────────────────
const BUCKET_ARCHIVOS = 'inscripciones';

function limpiarNombreArchivo(txt) {
  return String(txt || 'archivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
}

// Sube un archivo al bucket y devuelve { ok, url } o { ok:false, error }
async function subirArchivo(carpeta, nombreBase, blob, contentType) {
  if (!supabaseClient) return { ok: false, error: 'No se pudo conectar con la base de datos.' };
  const ruta = `${limpiarNombreArchivo(carpeta)}/${Date.now()}-${limpiarNombreArchivo(nombreBase)}`;
  try {
    const { error } = await supabaseClient.storage.from(BUCKET_ARCHIVOS)
      .upload(ruta, blob, { contentType, cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(BUCKET_ARCHIVOS).getPublicUrl(ruta);
    return { ok: true, url: data.publicUrl };
  } catch (err) {
    console.error('Error subiendo archivo:', err);
    const msg = err.message || String(err);
    let texto = msg;
    if (/bucket not found/i.test(msg)) texto = `No existe el espacio de archivos "${BUCKET_ARCHIVOS}" en Supabase Storage.`;
    else if (/row-level security|unauthorized|403/i.test(msg)) texto = 'Supabase Storage no da permiso para subir archivos (falta la política de subida).';
    else if (/mime|content type|not supported/i.test(msg)) texto = 'Ese tipo de archivo no está permitido.';
    else if (/size|too large|exceed/i.test(msg)) texto = 'El archivo es demasiado grande.';
    return { ok: false, error: texto };
  }
}

function dataUrlABlob(dataUrl) {
  const [cab, datos] = dataUrl.split(',');
  const tipo = (cab.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(datos);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo });
}

function esUrlArchivo(v) { return typeof v === 'string' && /^(https?:|data:)/.test(v) && !/placeholder$/.test(v); }

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar Supabase DENTRO del DOMContentLoaded para asegurar que el SDK esté cargado
  try {
    if (typeof window.supabase !== 'undefined') {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      console.log("Supabase conectado correctamente.");

      // Sincronización en tiempo real
      supabaseClient.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'competidores' }, () => {
          fetchAllFromSupabase();
        })
        .subscribe();

      // Carga inicial desde la nube
      fetchAllFromSupabase();

      // Respaldo por si el tiempo real no está activo: refresca cada 30 s con el panel abierto
      setInterval(() => {
        if (document.body.classList.contains('modo-panel') && !editMode) fetchAllFromSupabase();
      }, 30000);
    } else {
      console.warn("SDK de Supabase no disponible. Usando almacenamiento local.");
      setEstadoNube(false, 'No cargó la librería de Supabase');
    }
  } catch (e) {
    console.error("Error inicializando Supabase:", e);
  }

  setupTabs();
  setupInscripcionForm();
  loadCompetitors();
  setupEventListeners();
});

/* ==========================================================================
   NAVEGACIÓN ENTRE PESTAÑAS (TABS)
   ========================================================================== */

function setupTabs() {
  const tabInscripcionBtn = document.getElementById('tabInscripcionBtn');
  const tabClasificacionBtn = document.getElementById('tabClasificacionBtn');
  const seccionInscripcion = document.getElementById('seccionInscripcion');
  const seccionClasificacion = document.getElementById('seccionClasificacion');
  
  const adminLoginModal = document.getElementById('adminLoginModal');
  const btnCancelarAdminLogin = document.getElementById('btnCancelarAdminLogin');
  const btnIngresarAdmin = document.getElementById('btnIngresarAdmin');
  const adminPassword = document.getElementById('adminPassword');
  const adminLoginError = document.getElementById('adminLoginError');

  let adminAuntenticado = false;

  if (tabInscripcionBtn && tabClasificacionBtn) {
    tabInscripcionBtn.addEventListener('click', () => {
      tabInscripcionBtn.classList.add('active');
      tabClasificacionBtn.classList.remove('active');
      seccionInscripcion.style.display = 'block';
      seccionClasificacion.style.display = 'none';
      document.body.classList.remove('modo-panel');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    tabClasificacionBtn.addEventListener('click', () => {
      if (!adminAuntenticado) {
        adminPassword.value = '';
        adminLoginError.style.display = 'none';
        adminLoginModal.style.display = 'flex';
        return;
      }
      mostrarTabAdmin();
    });
  }

  function mostrarTabAdmin() {
    tabClasificacionBtn.classList.add('active');
    tabInscripcionBtn.classList.remove('active');
    seccionInscripcion.style.display = 'none';
    seccionClasificacion.style.display = 'block';
    document.body.classList.add('modo-panel');
    loadCompetitors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (btnCancelarAdminLogin) {
    btnCancelarAdminLogin.addEventListener('click', () => {
      adminLoginModal.style.display = 'none';
    });
  }

  if (btnIngresarAdmin) {
    btnIngresarAdmin.addEventListener('click', () => {
      const pwd = adminPassword.value;
      if (pwd === 'admin123' || pwd === 'vikingos2026') { // Contraseñas de prueba
        adminAuntenticado = true;
        adminLoginModal.style.display = 'none';
        mostrarTabAdmin();
      } else {
        adminLoginError.style.display = 'block';
      }
    });
  }
}

/* ==========================================================================
   FORMULARIO OFICIAL DE INSCRIPCIÓN (GOOGLE FORM INTEGRATION)
   ========================================================================== */

function setupInscripcionForm() {
  const formInscripcion = document.getElementById('formInscripcionOficial');
  if (!formInscripcion) return;

  // Manejador de comprobante de pago (Drag and drop y file input)
  const comprobanteDropzone = document.getElementById('comprobanteDropzone');
  const regComprobante = document.getElementById('regComprobante');
  const previewContainer = document.getElementById('comprobantePreviewContainer');
  const imgPreview = document.getElementById('comprobanteImgPreview');
  const fileNameSpan = document.getElementById('comprobanteFileName');
  const removerComprobanteBtn = document.getElementById('removerComprobanteBtn');

  comprobanteDropzone.addEventListener('click', (e) => {
    if (e.target !== removerComprobanteBtn && !removerComprobanteBtn.contains(e.target)) {
      regComprobante.click();
    }
  });

  comprobanteDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    comprobanteDropzone.classList.add('dragover');
  });

  comprobanteDropzone.addEventListener('dragleave', () => {
    comprobanteDropzone.classList.remove('dragover');
  });

  comprobanteDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    comprobanteDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      procesarArchivoComprobante(e.dataTransfer.files[0]);
    }
  });

  regComprobante.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      procesarArchivoComprobante(e.target.files[0]);
    }
  });

  removerComprobanteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    comprobanteArchivo = { dataUrl: null, blob: null, nombre: '', tipo: '' };
    regComprobante.value = '';
    previewContainer.style.display = 'none';
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    fileNameSpan.textContent = '';
  });

  function procesarArchivoComprobante(file) {
    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo supera el límite de 10MB permitido.");
      return;
    }

    comprobanteArchivo.nombre = file.name;
    comprobanteArchivo.tipo = file.type;
    fileNameSpan.textContent = `Archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    previewContainer.style.display = 'flex';

    if (file.type.startsWith('image/')) {
      // Las fotos del celular pesan varios MB: se reducen antes de guardarlas
      comprobanteArchivo.blob = null;
      comprimirImagen(file).then(dataUrl => {
        comprobanteArchivo.dataUrl = dataUrl;
        comprobanteArchivo.blob = dataUrlABlob(dataUrl);
        comprobanteArchivo.tipo = 'image/jpeg';
        imgPreview.src = dataUrl;
        imgPreview.style.display = 'block';
        const kb = Math.round((dataUrl.length * 3 / 4) / 1024);
        fileNameSpan.textContent = `Archivo: ${file.name} (${kb} KB)`;
      }).catch(() => {
        const reader = new FileReader();
        comprobanteArchivo.blob = file;
        reader.onload = (ev) => {
          comprobanteArchivo.dataUrl = ev.target.result;
          imgPreview.src = ev.target.result;
          imgPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      });
    } else {
      // PDF o documento
      imgPreview.style.display = 'none';
      comprobanteArchivo.dataUrl = null;
      comprobanteArchivo.blob = file;
      comprobanteArchivo.tipo = file.type || 'application/pdf';
    }
  }

  // Manejador de música MP3
  const musicaDropzone = document.getElementById('musicaDropzone');
  const regMusica = document.getElementById('regMusica');
  const musicaPreviewContainer = document.getElementById('musicaPreviewContainer');
  const musicaFileName = document.getElementById('musicaFileName');
  const musicaAudioPreview = document.getElementById('musicaAudioPreview');
  const removerMusicaBtn = document.getElementById('removerMusicaBtn');

  musicaDropzone.addEventListener('click', (e) => {
    if (e.target !== removerMusicaBtn && !removerMusicaBtn.contains(e.target) && e.target !== musicaAudioPreview) {
      regMusica.click();
    }
  });

  regMusica.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert("El archivo de audio supera los 10MB permitidos.");
        return;
      }
      musicaArchivo.nombre = file.name;
      musicaArchivo.file = file;
      musicaArchivo.url = URL.createObjectURL(file);
      musicaFileName.textContent = `Pista MP3: ${file.name}`;
      musicaAudioPreview.src = musicaArchivo.url;
      musicaPreviewContainer.style.display = 'flex';
    }
  });

  removerMusicaBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    musicaArchivo = { nombre: '', url: null, file: null };
    regMusica.value = '';
    musicaAudioPreview.src = '';
    musicaPreviewContainer.style.display = 'none';
    musicaFileName.textContent = '';
  });

  // Envío del formulario oficial de inscripción
  formInscripcion.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnEnviar = document.getElementById('btnSubmitInscripcion');
    if (btnEnviar && btnEnviar.disabled) return;

    const nombre = document.getElementById('regNombre').value.trim();
    const correo = document.getElementById('regCorreo').value.trim();
    const cedula = document.getElementById('regCedula').value.trim();
    const celular = document.getElementById('regCelular').value.trim();
    const ciudad = document.getElementById('regCiudad').value.trim();
    const categoriaRadio = document.querySelector('input[name="regCategoria"]:checked');
    const divisionRadio = document.querySelector('input[name="regDivision"]:checked');
    const terminosChecked = document.getElementById('regTerminos').checked;

    if (!nombre || !correo || !cedula || !celular || !ciudad) {
      alert("Por favor diligencie todos los campos personales obligatorios.");
      return;
    }

    if (!categoriaRadio) {
      alert("Por favor seleccione la categoría en la que va a competir.");
      return;
    }

    if (!divisionRadio) {
      alert("Por favor seleccione la división en la que va a competir.");
      return;
    }

    if (!comprobanteArchivo.nombre) {
      alert("Es obligatorio adjuntar el comprobante de pago para validar su inscripción.");
      return;
    }

    if (!terminosChecked) {
      alert("Debe aceptar los términos, reglamento y condiciones de Vikingos Classic Bogotá.");
      return;
    }

    const categoria = categoriaRadio.value;
    const division = divisionRadio.value;
    const radicadoCode = `VK-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const numeroCompetidor = generarNumeroUnico();

    // Guardar competidor en localStorage
    const competidores = getCompetidores();
    
    // Verificar si ya existe por cédula
    const indexExistente = competidores.findIndex(c => String(c.cedula).trim() === cedula);

    const nuevoCompetidor = {
      numero: indexExistente !== -1 ? competidores[indexExistente].numero : numeroCompetidor,
      nombre: nombre,
      cedula: cedula,
      correo: correo,
      celular: celular,
      ciudad: ciudad,
      categoria: categoria,
      peso: indexExistente !== -1 ? competidores[indexExistente].peso : 'N/A',
      estatura: indexExistente !== -1 ? competidores[indexExistente].estatura : 'N/A',
      division: division,
      subdivision: indexExistente !== -1 ? competidores[indexExistente].subdivision : 'Pendiente de pesaje',
      pago: 'Pagado Online',
      asistencia: 'Pendiente',
      comprobanteUrl: '',
      comprobanteNombre: comprobanteArchivo.nombre || '',
      musicaNombre: musicaArchivo.nombre || '',
      musicaUrl: '',
      radicado: radicadoCode,
      fechaInscripcion: new Date().toLocaleDateString('es-CO')
    };

    const registro = indexExistente !== -1
      ? { ...competidores[indexExistente], ...nuevoCompetidor }
      : nuevoCompetidor;

    if (!comprobanteArchivo.blob) {
      alert("El comprobante todavía se está procesando. Espere un segundo e intente de nuevo.");
      return;
    }

    // Enviar a la base de datos y esperar la respuesta antes de confirmar
    const textoOriginal = btnEnviar ? btnEnviar.innerHTML : '';
    const estadoBoton = (txt) => { if (btnEnviar) { btnEnviar.disabled = true; btnEnviar.textContent = txt; } };
    const restaurarBoton = () => { if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.innerHTML = textoOriginal; } };
    const fallo = (msg) => {
      restaurarBoton();
      alert(`No se pudo completar la inscripción.\n\n${msg}\n\nRevise su conexión e intente de nuevo. Si el problema continúa, comuníquese con la organización.`);
    };

    // 1) Subir el comprobante
    estadoBoton('Subiendo comprobante...');
    const extComp = comprobanteArchivo.tipo === 'application/pdf' ? 'pdf' : (comprobanteArchivo.tipo.split('/')[1] || 'jpg');
    const subidaComp = await subirArchivo(cedula, `comprobante.${extComp}`, comprobanteArchivo.blob, comprobanteArchivo.tipo || 'image/jpeg');
    if (!subidaComp.ok) { fallo(`Comprobante: ${subidaComp.error}`); return; }
    registro.comprobanteUrl = subidaComp.url;

    // 2) Subir la música (opcional)
    if (musicaArchivo.file) {
      estadoBoton('Subiendo música...');
      const subidaMusica = await subirArchivo(cedula, musicaArchivo.nombre || 'musica.mp3', musicaArchivo.file, musicaArchivo.file.type || 'audio/mpeg');
      if (!subidaMusica.ok) { fallo(`Música: ${subidaMusica.error}`); return; }
      registro.musicaUrl = subidaMusica.url;
    }

    // 3) Guardar la inscripción
    estadoBoton('Enviando inscripción...');
    const resultado = await syncCompetidorToSupabase(registro);
    restaurarBoton();

    if (!resultado.ok) {
      alert(`No se pudo completar la inscripción.\n\n${resultado.error}\n\nRevise su conexión e intente de nuevo. Si el problema continúa, comuníquese con la organización.`);
      return;
    }

    if (indexExistente !== -1) competidores[indexExistente] = registro;
    else competidores.push(registro);
    saveCompetidores(competidores);

    // Mostrar modal con ticket de atleta
    mostrarTicketAtleta(nuevoCompetidor);

    // Limpiar formulario
    formInscripcion.reset();
    comprobanteArchivo = { dataUrl: null, blob: null, nombre: '', tipo: '' };
    previewContainer.style.display = 'none';
    imgPreview.src = '';
    fileNameSpan.textContent = '';
    musicaArchivo = { nombre: '', url: null, file: null };
    musicaPreviewContainer.style.display = 'none';
    musicaAudioPreview.src = '';
    musicaFileName.textContent = '';
  });

  // Modal de ticket de atleta
  const registroModal = document.getElementById('registroModal');
  const btnCerrarModal = document.getElementById('btnCerrarModal');
  const btnImprimirTicket = document.getElementById('btnImprimirTicket');

  if (btnCerrarModal) {
    btnCerrarModal.addEventListener('click', () => {
      registroModal.style.display = 'none';
    });
  }

  if (btnImprimirTicket) {
    btnImprimirTicket.addEventListener('click', () => {
      window.print();
    });
  }
}

function mostrarTicketAtleta(atleta) {
  const modal = document.getElementById('registroModal');
  document.getElementById('ticketRadicado').textContent = atleta.radicado || 'VK-2026-OFICIAL';
  document.getElementById('ticketNombre').textContent = atleta.nombre;
  document.getElementById('ticketCedula').textContent = atleta.cedula;
  document.getElementById('ticketCategoria').textContent = formatearNombreCategoria(atleta.categoria);
  document.getElementById('ticketDivision').textContent = atleta.division;
  document.getElementById('ticketCiudad').textContent = atleta.ciudad;

  modal.style.display = 'flex';
}

function formatearNombreCategoria(cat) {
  const nombres = {
    'bodybuilding': 'Bodybuilding',
    'classic_physique': 'Classic Physique',
    'mens_physique': "Men's Physique",
    'wellness': 'Wellness',
    'bikini': 'Bikini',
    'figure': 'Figure',
    'fit_model': 'Fit Model',
    'womans_physique': "Woman's Physique",
    'wheelchair': 'Wheelchair'
  };
  return nombres[cat] || cat;
}

/* ==========================================================================
   PANEL DE JUECES Y PESAJE
   ========================================================================== */

let filtroEstadoActual = 'todos';
let dragSrc = null;

// ─── HELPERS DE DATOS ─────────────────────────────────────
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function esVacio(v) {
  return v === null || v === undefined || String(v).trim() === '' || String(v).trim().toUpperCase() === 'N/A';
}

function aNumero(v) {
  if (esVacio(v)) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Unifica las variantes de clave de categoría (womens/womans, men's, espacios...)
function claveCategoria(cat) {
  const k = String(cat || '').toLowerCase().trim().replace(/[’'´`]/g, '').replace(/[\s-]+/g, '_');
  const alias = {
    womens_physique: 'womans_physique',
    women_physique: 'womans_physique',
    woman_physique: 'womans_physique',
    men_physique: 'mens_physique'
  };
  return alias[k] || k;
}

const CATS_CON_PESO = ['bodybuilding', 'wheelchair', 'classic_physique'];
const CATS_SIN_ESTATURA = ['bodybuilding', 'wheelchair'];

function necesitaPeso(cat) { return CATS_CON_PESO.includes(claveCategoria(cat)); }
function necesitaEstatura(cat) {
  const c = claveCategoria(cat);
  return !!c && !CATS_SIN_ESTATURA.includes(c);
}
function divisionConSubdivision(div) {
  const d = normalizarDivision(div);
  return d === 'Novato' || d === 'Avanzado';
}

// Un registro viene de la inscripción online si tiene radicado o correo
function esInscripcionOnline(c) {
  return !!(c && (c.radicado || c.correo));
}

// Mapa número -> cantidad de atletas distintos que lo usan
function contarNumeros(competidores) {
  const mapa = {};
  competidores.forEach(c => {
    if (esVacio(c.numero)) return;
    const n = String(c.numero).trim();
    const quien = String(c.cedula || c.nombre || '').trim().toLowerCase();
    (mapa[n] = mapa[n] || new Set()).add(quien);
  });
  const conteo = {};
  Object.keys(mapa).forEach(n => { conteo[n] = mapa[n].size; });
  return conteo;
}

// Devuelve la lista de datos que le faltan a un competidor (vacía = completo)
function faltantesCompetidor(c, conteoNumeros) {
  const f = [];
  const cat = claveCategoria(c.categoria);
  if (esVacio(c.numero)) f.push('número');
  else if (conteoNumeros && conteoNumeros[String(c.numero).trim()] > 1) f.push('número repetido');
  if (!cat) f.push('categoría');
  if (cat && necesitaPeso(cat) && aNumero(c.peso) <= 0) f.push('peso');
  if (cat && necesitaEstatura(cat) && aNumero(c.estatura) <= 0) f.push('estatura');

  if (cat && divisionConSubdivision(c.division) && !f.includes('peso') && !f.includes('estatura')) {
    const res = calcularSubdivision(cat, c.division, aNumero(c.peso), aNumero(c.estatura));
    if (res.error) f.push('fuera de rango');
    else if (esVacio(c.subdivision) || c.subdivision === 'Pendiente de pesaje' || c.subdivision === 'No aplica') f.push('subdivisión');
  }
  return f;
}

// ─── EVENTOS DEL PANEL ────────────────────────────────────
function setupEventListeners() {
  document.getElementById('borrarTodosBtn').addEventListener('click', borrarTodosLosCompetidores);

  document.getElementById('categoria').addEventListener('change', function() {
    const categoria = this.value;
    document.getElementById('pesoContainer').style.display = necesitaPeso(categoria) ? 'block' : 'none';
    document.getElementById('estaturaContainer').style.display = necesitaEstatura(categoria) ? 'block' : 'none';
    if (!necesitaPeso(categoria)) document.getElementById('peso').value = '';
    if (!necesitaEstatura(categoria)) document.getElementById('estatura').value = '';
    document.getElementById('subdivisionContainer').style.display = 'none';
  });

  document.getElementById('division').addEventListener('change', function() {
    const show = divisionConSubdivision(this.value);
    document.getElementById('subdivisionContainer').style.display = show ? 'block' : 'none';
    if (!show) document.getElementById('subdivision').value = '';
  });

  document.getElementById('clasificarBtn').addEventListener('click', clasificarAutomaticamente);
  document.getElementById('clasificarTodosBtn').addEventListener('click', clasificarTodos);
  document.getElementById('exportarJsonBtn').addEventListener('click', exportarJson);
  document.getElementById('exportarExcelBtn').addEventListener('click', exportarExcel);
  document.getElementById('importarBtn').addEventListener('click', () => {
    document.getElementById('importarInput').click();
  });
  document.getElementById('importarInput').addEventListener('change', importarDatos);
  document.getElementById('generarClasificacionBtn').addEventListener('click', generarClasificacionFinal);
  document.getElementById('exportarClasificacionBtn').addEventListener('click', exportarClasificacionFinal);

  const btnCancelarEdicion = document.getElementById('btnCancelarEdicion');
  if (btnCancelarEdicion) btnCancelarEdicion.addEventListener('click', resetForm);

  document.getElementById('buscador').addEventListener('input', filtrarTabla);
  const filtroCategoria = document.getElementById('filtroCategoria');
  if (filtroCategoria) filtroCategoria.addEventListener('change', filtrarTabla);

  const btnNube = document.getElementById('estadoNube');
  if (btnNube) {
    btnNube.addEventListener('click', async () => {
      const ok = await fetchAllFromSupabase();
      showToast(ok ? 'Lista actualizada desde la nube' : 'No se pudo conectar con la nube', ok ? 'success' : 'error');
    });
  }

  document.querySelectorAll('.pv-tab').forEach(tab => {
    tab.addEventListener('click', () => mostrarPvTab(tab.dataset.tab));
  });

  // Controles del formulario en teléfono (hoja deslizable)
  const btnNuevoMovil = document.getElementById('btnNuevoMovil');
  if (btnNuevoMovil) btnNuevoMovil.addEventListener('click', () => { resetForm(); abrirFormularioMovil(); });
  const btnAccionesMovil = document.getElementById('btnAccionesMovil');
  if (btnAccionesMovil) btnAccionesMovil.addEventListener('click', () => abrirFormularioMovil('acciones'));
  const btnCerrarFormMovil = document.getElementById('btnCerrarFormMovil');
  if (btnCerrarFormMovil) btnCerrarFormMovil.addEventListener('click', resetForm);
  window.addEventListener('resize', () => { if (!esMovil()) cerrarFormularioMovil(); });

  document.querySelectorAll('.chip-filtro').forEach(chip => {
    chip.addEventListener('click', () => setFiltroEstado(chip.dataset.filtro));
  });

  const statOnline = document.getElementById('statCardOnlinePendientes');
  if (statOnline) {
    statOnline.addEventListener('click', () => {
      setFiltroEstado('online_pendientes');
      mostrarPvTab('competidores');
    });
  }

  document.getElementById('competidorForm').addEventListener('submit', function(e) {
    e.preventDefault();
    handleFormSubmit();
  });

  const btnCerrarVerComprobante = document.getElementById('btnCerrarVerComprobante');
  if (btnCerrarVerComprobante) {
    btnCerrarVerComprobante.addEventListener('click', () => {
      document.getElementById('verComprobanteModal').style.display = 'none';
      document.querySelectorAll('#comprobanteModalBody audio').forEach(a => a.pause());
    });
  }
}

// ─── CLASIFICACIÓN AUTOMÁTICA ─────────────────────────────
function clasificarAutomaticamente() {
  const categoria = document.getElementById('categoria').value;
  const peso = aNumero(document.getElementById('peso').value);
  const estatura = aNumero(document.getElementById('estatura').value);
  const division = document.getElementById('division').value;

  if (!categoria) {
    showToast('Seleccione una categoría primero', 'warning');
    return false;
  }

  const resultado = calcularSubdivision(categoria, division, peso, estatura);
  if (resultado.error) {
    showToast(resultado.error, 'error');
    return false;
  }

  document.getElementById('subdivision').value = resultado.subdivision || '';
  document.getElementById('subdivisionContainer').style.display = divisionConSubdivision(division) ? 'block' : 'none';
  return true;
}

function clasificarTodos() {
  const competidores = getCompetidores();
  if (!competidores.length) { showToast('No hay competidores', 'warning'); return; }
  if (!confirm("¿Clasificar automáticamente TODOS los competidores?\nEsta acción actualizará solo las subdivisiones.")) return;

  let actualizados = 0;
  let errores = 0;

  const nuevos = competidores.map(c => {
    const res = calcularSubdivision(c.categoria, c.division, aNumero(c.peso), aNumero(c.estatura));
    if (res.error) { errores++; return c; }
    const sub = res.subdivision || 'No aplica';
    if (sub === c.subdivision) return c;
    const nc = { ...c, subdivision: sub };
    syncCompetidorToSupabase(nc);
    actualizados++;
    return nc;
  });

  saveCompetidores(nuevos);
  loadCompetitors();
  showToast(
    errores
      ? `${actualizados} actualizados · ${errores} sin clasificar por datos pendientes (filtra "Datos incompletos")`
      : `${actualizados} subdivisiones actualizadas`,
    errores ? 'warning' : 'success'
  );
}

// ─── CLASSIC PHYSIQUE (tabla oficial Vikingos Classic) ───
const CLASSIC_PHYSIQUE_TIERS = [
  { clase: 'A', maxEstatura: 1.63, maxPeso: 75.5 },
  { clase: 'A', maxEstatura: 1.65, maxPeso: 78.0 },
  { clase: 'A', maxEstatura: 1.68, maxPeso: 80.3 },
  { clase: 'A', maxEstatura: 1.70, maxPeso: 82.6 },
  { clase: 'B', maxEstatura: 1.73, maxPeso: 84.8 },
  { clase: 'B', maxEstatura: 1.75, maxPeso: 88.0 },
  { clase: 'B', maxEstatura: 1.78, maxPeso: 91.6 },
  { clase: 'C', maxEstatura: 1.80, maxPeso: 84.8 },
  { clase: 'C', maxEstatura: 1.83, maxPeso: 98.4 },
  { clase: 'D', maxEstatura: 1.85, maxPeso: 101.6 },
  { clase: 'D', maxEstatura: 1.88, maxPeso: 105.2 },
  { clase: 'D', maxEstatura: 1.91, maxPeso: 108.4 },
  { clase: 'D', maxEstatura: 1.93, maxPeso: 111.6 },
  { clase: 'D', maxEstatura: 1.96, maxPeso: 114.8 },
  { clase: 'D', maxEstatura: 1.98, maxPeso: 117.9 },
  { clase: 'D', maxEstatura: 2.01, maxPeso: 121.1 },
  { clase: 'D', maxEstatura: Infinity, maxPeso: 124.3 },
];

function calcularClassicPhysique(peso, estatura) {
  const tier = CLASSIC_PHYSIQUE_TIERS.find(t => estatura <= t.maxEstatura);
  if (!tier) return { error: 'Estatura fuera de rango para Classic Physique' };
  if (peso > tier.maxPeso) {
    const alturaTxt = tier.maxEstatura === Infinity ? '>2.01m' : `≤${tier.maxEstatura}m`;
    return { error: `Clase ${tier.clase}: para ${alturaTxt} el peso máximo es ${tier.maxPeso}kg (actual: ${peso}kg)` };
  }
  return { subdivision: `Clase ${tier.clase}` };
}

function calcularSubdivision(categoria, division, peso, estatura) {
  if (!divisionConSubdivision(division)) return { subdivision: 'No aplica' };
  if (estatura > 3) estatura = estatura / 100; // si la escribieron en cm

  switch (claveCategoria(categoria)) {
    case 'mens_physique':
      if (estatura <= 0) return { error: 'Ingresa la estatura para Men\'s Physique' };
      if (estatura <= 1.70) return { subdivision: 'Hasta 1.70m' };
      if (estatura <= 1.75) return { subdivision: '1.70-1.75m' };
      if (estatura <= 1.80) return { subdivision: '1.75-1.80m' };
      return { subdivision: 'Más de 1.80m' };

    case 'bodybuilding':
    case 'wheelchair':
      if (peso <= 0) return { error: 'Ingresa el peso para esta categoría' };
      if (peso <= 70) return { subdivision: 'Hasta 70kg' };
      if (peso <= 80) return { subdivision: '70-80kg' };
      if (peso <= 90) return { subdivision: '80-90kg' };
      return { subdivision: 'Más de 90kg' };

    case 'classic_physique':
      if (peso <= 0 || estatura <= 0) return { error: 'Ingresa peso y estatura para Classic Physique' };
      return calcularClassicPhysique(peso, estatura);

    case 'bikini': case 'wellness': case 'figure': case 'fit_model': case 'womans_physique':
      if (estatura <= 0) return { error: 'Ingresa la estatura para esta categoría' };
      if (estatura <= 1.60) return { subdivision: 'Hasta 1.60m' };
      if (estatura <= 1.65) return { subdivision: '1.60-1.65m' };
      if (estatura <= 1.70) return { subdivision: '1.65-1.70m' };
      if (estatura <= 1.75) return { subdivision: '1.70-1.75m' };
      return { subdivision: 'Más de 1.75m' };

    default:
      return { subdivision: 'No aplica' };
  }
}

// ─── FORMULARIO DE PESAJE ─────────────────────────────────
function handleFormSubmit() {
  const competidorData = {
    numero: document.getElementById('numero').value.trim(),
    nombre: document.getElementById('nombre').value.trim(),
    cedula: document.getElementById('cedula').value.trim(),
    ciudad: document.getElementById('ciudad').value.trim(),
    categoria: claveCategoria(document.getElementById('categoria').value),
    peso: document.getElementById('peso').value || 'N/A',
    estatura: document.getElementById('estatura').value || 'N/A',
    division: normalizarDivision(document.getElementById('division').value),
    subdivision: document.getElementById('subdivision').value || 'No aplica',
    pago: document.getElementById('estadoPago').value || 'Pendiente',
    asistencia: document.getElementById('estadoAsistencia').value || 'Pendiente'
  };

  if (!validarCompetidor(competidorData)) return;

  // Número duplicado con otro atleta
  const competidores = getCompetidores();
  const duplicado = competidores.find((c, i) =>
    String(c.numero).trim() === competidorData.numero &&
    String(c.cedula).trim() !== competidorData.cedula &&
    (!editMode || i !== editId)
  );
  if (duplicado) {
    showToast(`El número ${competidorData.numero} ya está asignado a ${duplicado.nombre}`, 'error');
    return;
  }

  const resultado = calcularSubdivision(competidorData.categoria, competidorData.division, aNumero(competidorData.peso), aNumero(competidorData.estatura));
  if (resultado.error) {
    showToast(`No se puede guardar: ${resultado.error}`, 'error');
    return;
  }
  competidorData.subdivision = resultado.subdivision;

  if (editMode) {
    const anterior = competidores[editId] || {};
    updateCompetidor(editId, competidorData);
    showToast(esInscripcionOnline(anterior)
      ? `Inscripción online de ${competidorData.nombre} actualizada`
      : `${competidorData.nombre} actualizado`);
  } else {
    addCompetidor(competidorData);
    showToast(`${competidorData.nombre} registrado`);
  }

  resetForm();
}

function validarCompetidor(data) {
  if (!data.numero || !data.nombre || !data.cedula || !data.ciudad || !data.categoria || !data.division) {
    showToast('Complete todos los campos requeridos', 'error');
    return false;
  }
  if (necesitaPeso(data.categoria) && aNumero(data.peso) <= 0) {
    showToast('Ingrese el peso para esta categoría', 'error');
    return false;
  }
  if (necesitaEstatura(data.categoria) && aNumero(data.estatura) <= 0) {
    showToast('Ingrese la estatura para esta categoría', 'error');
    return false;
  }
  return true;
}

function addCompetidor(data) {
  const competidores = getCompetidores();
  competidores.push(data);
  saveCompetidores(competidores);
  syncCompetidorToSupabase(data);
  loadCompetitors();
}

function updateCompetidor(id, newData) {
  const competidores = getCompetidores();
  // Conserva correo, radicado, comprobante, música... de la inscripción online
  const updatedComp = { ...(competidores[id] || {}), ...newData };
  competidores[id] = updatedComp;
  saveCompetidores(competidores);
  syncCompetidorToSupabase(updatedComp);
  loadCompetitors();
  editMode = false;
  editId = null;
}

function deleteCompetidor(id) {
  const competidores = getCompetidores();
  const deletedComp = competidores[id];
  if (!deletedComp) return;
  if (!confirm(`¿Borrar a ${deletedComp.nombre}?`)) return;
  competidores.splice(id, 1);
  saveCompetidores(competidores);
  syncCompetidorToSupabase(deletedComp, true);
  loadCompetitors();
}

function getCompetidores() {
  try {
    return JSON.parse(localStorage.getItem('competidores')) || [];
  } catch (e) {
    return [];
  }
}

function saveCompetidores(competidores) {
  try {
    localStorage.setItem('competidores', JSON.stringify(competidores));
  } catch (e) {
    console.warn('No se pudo guardar la copia local (almacenamiento lleno):', e);
  }
}

// Reduce una foto a máx. 1400 px y la guarda como JPEG liviano
function comprimirImagen(file, maxLado = 1400, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// ─── LISTA DE COMPETIDORES ────────────────────────────────
function loadCompetitors() {
  const competidores = getCompetidores();
  const tbody = document.querySelector('#competidorTable tbody');
  if (!tbody) return;
  const conteo = contarNumeros(competidores);
  tbody.innerHTML = '';

  competidores.forEach((data, index) => addRowToTable(data, index, conteo));
  actualizarDashboardFinanciero(competidores, conteo);
  actualizarChipsFiltro(competidores, conteo);
  filtrarTabla();
}

function actualizarDashboardFinanciero(competidores, conteo) {
  const statTotal = document.getElementById('statTotalAtletas');
  const statEnSitio = document.getElementById('statEnSitio');
  const statRecaudado = document.getElementById('statRecaudado');
  const statOnline = document.getElementById('statOnlinePendientes');
  if (!statTotal || !statEnSitio || !statRecaudado) return;

  const costoInscripcion = 200000;
  let totalEnSitio = 0;
  let totalRecaudado = 0;
  let onlinePendientes = 0;

  competidores.forEach(comp => {
    if (comp.asistencia === 'Pesado' || comp.asistencia === 'En fila') totalEnSitio++;
    if (comp.pago === 'Pagado Online' || comp.pago === 'Pagado Efectivo') totalRecaudado += costoInscripcion;
    if (esInscripcionOnline(comp) && faltantesCompetidor(comp, conteo).length) onlinePendientes++;
  });

  statTotal.textContent = competidores.length;
  statEnSitio.textContent = totalEnSitio;
  statRecaudado.textContent = '$' + totalRecaudado.toLocaleString('es-CO');
  if (statOnline) statOnline.textContent = onlinePendientes;
}

function addRowToTable(data, index, conteo) {
  const row = document.createElement('tr');
  const online = esInscripcionOnline(data);
  const faltan = faltantesCompetidor(data, conteo || contarNumeros(getCompetidores()));
  const completo = faltan.length === 0;

  row.dataset.origen = online ? 'online' : 'sitio';
  row.dataset.estado = completo ? 'completo' : 'incompleto';
  row.dataset.categoria = claveCategoria(data.categoria);
  if (online && !completo) row.classList.add('fila-online-pendiente');

  let comprobanteHtml = '<span class="dato-vacio">—</span>';
  const musicaHtml = esUrlArchivo(data.musicaUrl)
    ? `<button type="button" class="btn btn-sm btn-ghost" onclick="verMusica(${index})">▶ Escuchar</button>`
    : (data.musicaNombre ? '<span class="dato-vacio" title="Se inscribió antes de que la música se guardara en la nube">Sin archivo</span>' : '<span class="dato-vacio">—</span>');
  if (data.comprobanteUrl || data.comprobanteNombre) {
    comprobanteHtml = `<button type="button" class="btn btn-sm btn-ghost" onclick="verComprobante(${index})">Ver</button>`;
  }

  const origenHtml = online
    ? `<span class="tag tag-online">Online</span>${data.radicado ? `<small class="tag-sub">${escapeHtml(data.radicado)}</small>` : ''}`
    : '<span class="tag tag-sitio">En sitio</span>';

  const datosHtml = completo
    ? '<span class="tag tag-ok">✓ Completo</span>'
    : `<span class="tag tag-falta">Falta: ${escapeHtml(faltan.join(', '))}</span>`;

  const pagoClass = data.pago === 'Pendiente' ? 'color: #ff3333;' : 'color: #4caf50;';
  const asistenciaClass = data.asistencia === 'Pesado' ? 'color: #4caf50;' : (data.asistencia === 'En fila' ? 'color: #e5a93b;' : 'color: #aaa;');
  const mostrar = v => esVacio(v) ? '<span class="dato-vacio">—</span>' : escapeHtml(v);

  const conUnidad = (v, u) => esVacio(v) ? '<span class="dato-vacio">—</span>' : escapeHtml(v) + u;
  const subHtml = (esVacio(data.subdivision) || data.subdivision === 'No aplica')
    ? '<span class="dato-vacio">—</span>'
    : (data.subdivision === 'Pendiente de pesaje'
        ? '<span class="dato-vacio">Pendiente</span>'
        : `<span class="badge badge-sub">${escapeHtml(data.subdivision)}</span>`);

  row.innerHTML = `
    <td class="td-num c-num">${mostrar(data.numero)}</td>
    <td class="c-nombre"><strong>${escapeHtml(data.nombre)}</strong></td>
    <td class="c-origen">${origenHtml}</td>
    <td class="c-datos">${datosHtml}</td>
    <td class="td-muted c-campo" data-label="Cédula">${escapeHtml(data.cedula)}</td>
    <td class="td-small c-campo" data-label="Ciudad">${escapeHtml(data.ciudad)}</td>
    <td class="c-campo" data-label="Categoría"><span class="badge badge-cat">${escapeHtml(formatearNombreCategoria(claveCategoria(data.categoria)))}</span></td>
    <td class="td-small c-campo" data-label="Peso">${conUnidad(data.peso, 'kg')}</td>
    <td class="td-small c-campo" data-label="Estatura">${conUnidad(data.estatura, 'm')}</td>
    <td class="c-campo" data-label="División"><span class="badge badge-div">${escapeHtml(data.division)}</span></td>
    <td class="c-campo" data-label="Subdivisión">${subHtml}</td>
    <td class="td-small c-campo" data-label="Pago" style="font-weight:600; ${pagoClass}">${escapeHtml(data.pago || 'Pendiente')}</td>
    <td class="td-small c-campo" data-label="Asistencia" style="font-weight:600; ${asistenciaClass}">${escapeHtml(data.asistencia || 'Pendiente')}</td>
    <td class="c-campo" data-label="Comprobante">${comprobanteHtml}</td>
    <td class="c-campo" data-label="Música">${musicaHtml}</td>
    <td class="c-acciones">
      <div class="td-actions">
        <button type="button" class="btn btn-sm ${completo ? 'btn-yellow' : 'btn-completar'}" onclick="editCompetidor(${index})">${completo ? 'Editar' : 'Completar'}</button>
        <button type="button" class="btn btn-sm btn-red-outline" onclick="deleteCompetidor(${index})" title="Borrar">✕</button>
      </div>
    </td>
  `;
  document.querySelector('#competidorTable tbody').appendChild(row);
}

function cumpleFiltroEstado(row, filtro) {
  const o = row.dataset.origen;
  const e = row.dataset.estado;
  switch (filtro) {
    case 'online_pendientes': return o === 'online' && e === 'incompleto';
    case 'online': return o === 'online';
    case 'sitio': return o === 'sitio';
    case 'completos': return e === 'completo';
    case 'incompletos': return e === 'incompleto';
    default: return true;
  }
}

function filtrarTabla() {
  const buscador = document.getElementById('buscador');
  const texto = buscador ? buscador.value.toLowerCase().trim() : '';
  const filtroCat = document.getElementById('filtroCategoria');
  const cat = filtroCat ? filtroCat.value : '';
  let visibles = 0;

  document.querySelectorAll('#competidorTable tbody tr').forEach(row => {
    const visible = (!texto || row.innerText.toLowerCase().includes(texto))
      && (!cat || row.dataset.categoria === cat)
      && cumpleFiltroEstado(row, filtroEstadoActual);
    row.style.display = visible ? '' : 'none';
    if (visible) visibles++;
  });

  const sinResultados = document.getElementById('sinResultados');
  if (sinResultados) sinResultados.style.display = visibles === 0 ? 'block' : 'none';
}

function setFiltroEstado(filtro) {
  filtroEstadoActual = filtro || 'todos';
  document.querySelectorAll('.chip-filtro').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filtro === filtroEstadoActual);
  });
  filtrarTabla();
}

function actualizarChipsFiltro(competidores, conteo) {
  const cuentas = { todos: 0, online_pendientes: 0, online: 0, sitio: 0, completos: 0, incompletos: 0 };
  competidores.forEach(c => {
    const online = esInscripcionOnline(c);
    const completo = faltantesCompetidor(c, conteo).length === 0;
    cuentas.todos++;
    if (online) cuentas.online++; else cuentas.sitio++;
    if (completo) cuentas.completos++; else cuentas.incompletos++;
    if (online && !completo) cuentas.online_pendientes++;
  });
  Object.entries(cuentas).forEach(([k, v]) => {
    const el = document.querySelector(`.chip-filtro[data-filtro="${k}"] .chip-count`);
    if (el) el.textContent = v;
  });
}

function verComprobante(index) {
  const comp = getCompetidores()[index];
  if (!comp) return;

  const modal = document.getElementById('verComprobanteModal');
  const modalSubtitle = document.getElementById('comprobanteModalSubtitle');
  const modalBody = document.getElementById('comprobanteModalBody');

  modalSubtitle.textContent = `Atleta: ${comp.nombre} (C.C. ${comp.cedula})`;

  const url = esUrlArchivo(comp.comprobanteUrl) ? comp.comprobanteUrl : '';
  const esPdf = /\.pdf($|\?)/i.test(url) || /\.pdf$/i.test(comp.comprobanteNombre || '');
  const nombreArchivo = escapeHtml(comp.comprobanteNombre || 'Comprobante');

  if (url && !esPdf) {
    modalBody.innerHTML = `
      <img src="${escapeHtml(url)}" alt="Comprobante" style="max-width: 100%; max-height: 60vh; border-radius: 8px; border: 1px solid #444;">
      <p style="margin-top: 10px; color: #aaa; font-size: 13px;">${nombreArchivo}</p>
      ${url.startsWith('http') ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn-ver-comprobante" style="display:inline-block;margin-top:8px;text-decoration:none;">Abrir / descargar</a>` : ''}
    `;
  } else if (url && esPdf) {
    modalBody.innerHTML = `
      <iframe src="${escapeHtml(url)}" title="Comprobante PDF" style="width:100%;height:60vh;border:1px solid #444;border-radius:8px;background:#fff;"></iframe>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn-ver-comprobante" style="display:inline-block;margin-top:10px;text-decoration:none;">Abrir PDF en otra pestaña</a>
    `;
  } else {
    modalBody.innerHTML = `
      <p style="color: #f5b027; font-weight: bold;">${nombreArchivo}</p>
      <p style="color: #aaa; font-size: 13px; margin-top: 6px;">Este archivo se registró antes de que los comprobantes se guardaran en la nube, así que solo quedó el nombre.</p>
    `;
  }

  modal.style.display = 'flex';
}

function verMusica(index) {
  const comp = getCompetidores()[index];
  if (!comp || !esUrlArchivo(comp.musicaUrl)) return;
  const url = escapeHtml(comp.musicaUrl);
  document.getElementById('comprobanteModalSubtitle').textContent = `Música de ${comp.nombre} (#${esVacio(comp.numero) ? '—' : comp.numero})`;
  document.getElementById('comprobanteModalBody').innerHTML = `
    <p style="color:#f5b027;font-weight:600;margin-bottom:12px;word-break:break-word;">${escapeHtml(comp.musicaNombre || 'Pista MP3')}</p>
    <audio controls src="${url}" style="width:100%;"></audio>
    <a href="${url}" target="_blank" rel="noopener" download class="btn-ver-comprobante" style="display:inline-block;margin-top:12px;text-decoration:none;">Descargar MP3</a>
  `;
  document.getElementById('verComprobanteModal').style.display = 'flex';
}

function editCompetidor(index) {
  const data = getCompetidores()[index];
  if (!data) return;
  const val = v => esVacio(v) ? '' : v;

  document.getElementById('numero').value = val(data.numero);
  document.getElementById('nombre').value = val(data.nombre);
  document.getElementById('cedula').value = val(data.cedula);
  document.getElementById('ciudad').value = val(data.ciudad);
  document.getElementById('categoria').value = claveCategoria(data.categoria);
  document.getElementById('categoria').dispatchEvent(new Event('change'));

  document.getElementById('peso').value = val(data.peso);
  document.getElementById('estatura').value = val(data.estatura);
  document.getElementById('division').value = normalizarDivision(data.division);
  document.getElementById('subdivision').value =
    (!esVacio(data.subdivision) && data.subdivision !== 'No aplica' && data.subdivision !== 'Pendiente de pesaje') ? data.subdivision : '';

  document.getElementById('estadoPago').value = data.pago || 'Pendiente';
  document.getElementById('estadoAsistencia').value = data.asistencia || 'Pendiente';
  document.getElementById('subdivisionContainer').style.display = divisionConSubdivision(data.division) ? 'block' : 'none';

  editMode = true;
  editId = index;

  const btnCancelar = document.getElementById('btnCancelarEdicion');
  if (btnCancelar) btnCancelar.style.display = 'block';

  const faltan = faltantesCompetidor(data, contarNumeros(getCompetidores()));
  const completando = esInscripcionOnline(data) && faltan.length > 0;
  const indicador = document.getElementById('editIndicator');
  if (indicador) {
    indicador.classList.add('visible');
    indicador.classList.toggle('online', completando);
    document.getElementById('editIndicatorText').textContent = completando
      ? `Completando inscripción online — ${data.nombre} (falta: ${faltan.join(', ')})`
      : `Editando competidor — ${data.nombre}`;
  }
  const btnTexto = document.getElementById('btnGuardarTexto');
  if (btnTexto) btnTexto.textContent = completando ? 'Completar inscripción' : 'Actualizar Competidor';

  const sidebar = document.querySelector('.pv-sidebar');
  if (sidebar) sidebar.scrollTop = 0;
  abrirFormularioMovil();
}

function resetForm() {
  document.getElementById('competidorForm').reset();
  editMode = false;
  editId = null;
  document.getElementById('pesoContainer').style.display = 'none';
  document.getElementById('estaturaContainer').style.display = 'none';
  document.getElementById('subdivisionContainer').style.display = 'none';
  document.getElementById('division').value = 'Novato';
  document.getElementById('estadoPago').value = 'Pendiente';
  document.getElementById('estadoAsistencia').value = 'Pendiente';

  const btnCancelar = document.getElementById('btnCancelarEdicion');
  if (btnCancelar) btnCancelar.style.display = 'none';

  const indicador = document.getElementById('editIndicator');
  if (indicador) indicador.classList.remove('visible', 'online');
  cerrarFormularioMovil();
  const btnTexto = document.getElementById('btnGuardarTexto');
  if (btnTexto) btnTexto.textContent = 'Guardar Competidor';
}

// ─── EXPORTAR ─────────────────────────────────────────────
function hoy() { return new Date().toISOString().split('T')[0]; }

function exportarJson() {
  const competidores = getCompetidores();
  if (!competidores.length) { showToast('No hay datos para exportar', 'warning'); return; }

  const blob = new Blob([JSON.stringify(competidores, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `competidores_vikingos_${hoy()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportarExcel() {
  const competidores = getCompetidores();
  if (!competidores.length) { showToast('No hay datos para exportar', 'warning'); return; }
  const conteo = contarNumeros(competidores);

  const datosFormateados = competidores.map(comp => {
    const faltan = faltantesCompetidor(comp, conteo);
    return {
      "Origen": esInscripcionOnline(comp) ? 'Online' : 'En sitio',
      "Estado datos": faltan.length ? `Falta: ${faltan.join(', ')}` : 'Completo',
      "Radicado": comp.radicado || '',
      "Número": esVacio(comp.numero) ? '' : comp.numero,
      "Nombre": comp.nombre,
      "Cédula": comp.cedula,
      "Correo": comp.correo || '',
      "Celular": comp.celular || '',
      "Ciudad": comp.ciudad,
      "Categoría": formatearNombreCategoria(claveCategoria(comp.categoria)),
      "Peso (kg)": esVacio(comp.peso) ? '' : comp.peso,
      "Estatura (m)": esVacio(comp.estatura) ? '' : comp.estatura,
      "División": comp.division,
      "Subdivisión": comp.subdivision,
      "Pago": comp.pago || '',
      "Asistencia": comp.asistencia || '',
      "Comprobante": comp.comprobanteNombre || 'No adjunto',
      "Link comprobante": (esUrlArchivo(comp.comprobanteUrl) && String(comp.comprobanteUrl).startsWith('http')) ? comp.comprobanteUrl : '',
      "Música": comp.musicaNombre || '',
      "Link música": esUrlArchivo(comp.musicaUrl) ? comp.musicaUrl : ''
    };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(datosFormateados), "Competidores");
  XLSX.writeFile(workbook, `competidores_vikingos_${hoy()}.xlsx`);
}

// ─── IMPORTAR (acepta columnas con nombres variados) ─────
function limpiarClave(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'´`]/g, '')
    .replace(/[\s_\-()\/]+/g, '')
    .trim();
}

function buscarCampo(row, ...alias) {
  const mapaRow = {};
  for (const k of Object.keys(row)) mapaRow[limpiarClave(k)] = row[k];
  for (const a of alias) {
    const val = mapaRow[limpiarClave(a)];
    if (val != null && val !== '') return val;
  }
  return null;
}

function normalizarCategoria(val) {
  const k = limpiarClave(val);
  const map = {
    'bodybuilding': 'bodybuilding',
    'classicphysique': 'classic_physique',
    'classic': 'classic_physique',
    'mensphysique': 'mens_physique',
    'menphysique': 'mens_physique',
    'mphysique': 'mens_physique',
    'fisicomasculino': 'mens_physique',
    'wellness': 'wellness',
    'bikini': 'bikini',
    'figure': 'figure',
    'figura': 'figure',
    'fitmodel': 'fit_model',
    'modelo': 'fit_model',
    'wheelchair': 'wheelchair',
    'sillaruedas': 'wheelchair',
    'womansphysique': 'womans_physique',
    'womensphysique': 'womans_physique',
    'womenphysique': 'womans_physique',
    'wphysique': 'womans_physique',
    'fisicofemenino': 'womans_physique',
  };
  if (map[k]) return map[k];
  // Claves más largas primero para que "womensphysique" no caiga en "mensphysique"
  const claves = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of claves) {
    if (k.includes(key)) return map[key];
  }
  return claveCategoria(val) || 'bodybuilding';
}

function normalizarDivision(val) {
  const k = limpiarClave(val || '');
  if (!k) return 'Novato';
  if (k.includes('prejuvenil') || k.includes('prejoven')) return 'Prejuvenil';
  if (k.includes('juvenil') || k.includes('joven')) return 'Juvenil';
  if (k.includes('seminovato')) return 'Semi-novatos';
  if (k.includes('novato')) return 'Novato';
  if (k.includes('avanzado') || k.includes('advance')) return 'Avanzado';
  if (k.includes('master') || k.includes('senior')) return 'Master';
  return 'Novato';
}

function importarDatos(e) {
  const file = e.target.files[0];
  if (!file) return;
  const esExcel = file.name.toLowerCase().endsWith('.xlsx');
  const reader = new FileReader();

  reader.onload = ev => {
    try {
      let datos = [];
      const normNum = v => {
        if (v == null || v === '') return 'N/A';
        const s = String(v).replace(',', '.').trim();
        return isNaN(parseFloat(s)) ? 'N/A' : s;
      };

      if (esExcel) {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellText: true, cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        datos = rows.map(row => {
          const categoria = normalizarCategoria(String(buscarCampo(row, 'Categoría', 'Categoria', 'Category', 'Cat') || ''));
          const division = normalizarDivision(String(buscarCampo(row, 'División', 'Division', 'Div', 'Grupo') || 'Novato'));
          const peso = normNum(buscarCampo(row, 'Peso (kg)', 'Peso', 'weight', 'kg'));
          const estatura = normNum(buscarCampo(row, 'Estatura (m)', 'Estatura', 'altura', 'height', 'talla'));
          const numero = buscarCampo(row, 'Número', 'Numero', 'Num', 'N°', 'No', '#');
          const sub = buscarCampo(row, 'Subdivisión', 'Subdivision', 'Sub', 'Clase');

          let subdivision = sub ? String(sub).trim() : '';
          if (!subdivision || subdivision === 'No aplica' || subdivision === 'Pendiente de pesaje') {
            const res = calcularSubdivision(categoria, division, aNumero(peso), aNumero(estatura));
            subdivision = res.subdivision || 'Pendiente de pesaje';
          }

          const item = {
            numero: numero != null && numero !== '' ? String(numero).trim() : 'N/A',
            nombre: String(buscarCampo(row, 'Nombre', 'Name', 'Atleta', 'Competidor', 'Participante') || 'Sin nombre').trim(),
            cedula: String(buscarCampo(row, 'Cédula', 'Cedula', 'CC', 'Documento', 'DNI') || 'Sin cedula').trim(),
            ciudad: String(buscarCampo(row, 'Ciudad', 'City', 'Municipio') || 'Sin ciudad').trim(),
            categoria, peso, estatura, division, subdivision,
            pago: String(buscarCampo(row, 'Pago', 'Estado de pago') || 'Pendiente'),
            asistencia: String(buscarCampo(row, 'Asistencia') || 'Pendiente')
          };
          const correo = buscarCampo(row, 'Correo', 'Email', 'Correo electronico');
          const celular = buscarCampo(row, 'Celular', 'Telefono', 'WhatsApp');
          const radicado = buscarCampo(row, 'Radicado');
          if (correo) item.correo = String(correo).trim();
          if (celular) item.celular = String(celular).trim();
          if (radicado) item.radicado = String(radicado).trim();
          return item;
        });
      } else {
        const json = JSON.parse(ev.target.result);
        if (!Array.isArray(json)) throw new Error('Formato inválido');
        datos = json.map(item => ({
          ...item,
          categoria: normalizarCategoria(item.categoria || ''),
          division: normalizarDivision(item.division),
          peso: esVacio(item.peso) ? 'N/A' : item.peso,
          estatura: esVacio(item.estatura) ? 'N/A' : item.estatura
        }));
      }

      if (confirm(`¿Importar ${datos.length} registros? Se reemplazarán los datos actuales de este navegador y se subirán a la nube.`)) {
        saveCompetidores(datos);
        datos.forEach(d => syncCompetidorToSupabase(d));
        loadCompetitors();
        showToast(`${datos.length} competidores importados`);
      }
    } catch (error) {
      showToast(`Error al importar: ${error.message}`, 'error');
    }
    e.target.value = '';
  };

  if (esExcel) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function generarNumeroUnico() {
  const usados = new Set(getCompetidores().map(c => String(c.numero).trim()));
  let n;
  let intentos = 0;
  do {
    n = Math.floor(Math.random() * 900) + 100;
    intentos++;
  } while (usados.has(String(n)) && intentos < 2000);
  return n;
}

function borrarTodosLosCompetidores() {
  const competidores = getCompetidores();
  if (!competidores.length) { showToast('No hay competidores para borrar', 'warning'); return; }

  if (confirm(`¿ESTÁ SEGURO DE QUE DESEA BORRAR TODOS LOS ${competidores.length} COMPETIDORES?\n\nEsta acción no se puede deshacer.`)) {
    if (confirm("¿REALMENTE ESTÁ SEGURO? Esta acción eliminará permanentemente todos los datos.")) {
      localStorage.removeItem('competidores');
      loadCompetitors();
      showToast(`Se han borrado los ${competidores.length} competidores`, 'error');
      document.getElementById('tablasClasificacion').innerHTML = '<div class="pv-empty"><p>Presiona "Generar Clasificación" para comenzar</p></div>';
      renderAvisoPendientes([]);
    }
  }
}

// ─── TOAST ────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (type === 'error' ? ' error' : type === 'warning' ? ' warning' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── CLASIFICACIÓN FINAL ─────────────────────────────────
function divisionesCon(subs) {
  return [
    { nombre: 'Prejuvenil', subs: [] },
    { nombre: 'Juvenil', subs: [] },
    { nombre: 'Semi-novatos', subs: [] },
    { nombre: 'Novato', subs },
    { nombre: 'Avanzado', subs },
    { nombre: 'Master', subs: [] }
  ];
}

const SUBS_ESTATURA_FEM = ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'];

const CATEGORIAS_DEF = [
  { clave: 'mens_physique', nombre: "MEN'S PHYSIQUE", divisiones: divisionesCon(['Hasta 1.70m', '1.70-1.75m', '1.75-1.80m', 'Más de 1.80m']) },
  { clave: 'classic_physique', nombre: 'CLASSIC PHYSIQUE', divisiones: divisionesCon(['Clase A', 'Clase B', 'Clase C', 'Clase D']) },
  { clave: 'bodybuilding', nombre: 'BODYBUILDING', divisiones: divisionesCon(['Hasta 70kg', '70-80kg', '80-90kg', 'Más de 90kg']) },
  { clave: 'wheelchair', nombre: 'WHEELCHAIR', divisiones: divisionesCon([]) },
  { clave: 'fit_model', nombre: 'FIT MODEL', divisiones: divisionesCon(SUBS_ESTATURA_FEM) },
  { clave: 'bikini', nombre: 'BIKINI', divisiones: divisionesCon(SUBS_ESTATURA_FEM) },
  { clave: 'wellness', nombre: 'WELLNESS', divisiones: divisionesCon(SUBS_ESTATURA_FEM) },
  { clave: 'figure', nombre: 'FIGURE', divisiones: divisionesCon(SUBS_ESTATURA_FEM) },
  { clave: 'womans_physique', nombre: "WOMAN'S PHYSIQUE", divisiones: divisionesCon(SUBS_ESTATURA_FEM) }
];

const normSub = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const porNumero = (a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0);

function itemClasificacion(c) {
  return { numero: c.numero, nombre: c.nombre, ciudad: c.ciudad, peso: c.peso ?? 'N/A', estatura: c.estatura ?? 'N/A' };
}

function generarClasificacionFinal() {
  const competidores = getCompetidores();
  if (!competidores.length) { showToast('No hay competidores registrados para generar la clasificación', 'warning'); return; }

  cancelarFusion();
  const contenedor = document.getElementById('tablasClasificacion');
  contenedor.innerHTML = '';
  const ubicados = new Set();
  let num = 1;

  CATEGORIAS_DEF.forEach(cat => {
    cat.divisiones.forEach(div => {
      const grupos = div.subs.length ? div.subs : [''];
      grupos.forEach(sub => {
        const filtrados = [];
        competidores.forEach((c, i) => {
          if (claveCategoria(c.categoria) !== cat.clave) return;
          if (normalizarDivision(c.division) !== div.nombre) return;
          if (sub && !normSub(c.subdivision).startsWith(normSub(sub))) return;
          filtrados.push(itemClasificacion(c));
          ubicados.add(i);
        });
        if (!filtrados.length) return;
        filtrados.sort(porNumero);

        const titulo = `${num}. ${cat.nombre} - ${div.nombre.toUpperCase()}${sub ? ' ' + sub : ''}`;
        contenedor.appendChild(crearTablaClasificacion(titulo, filtrados, cat.nombre));
        num++;
      });
    });
  });

  renderAvisoPendientes(competidores.filter((c, i) => !ubicados.has(i)));

  if (!contenedor.children.length) {
    contenedor.innerHTML = '<div class="pv-empty"><p>No se encontraron competidores listos para clasificar</p></div>';
  } else {
    showToast(`${num - 1} tablas generadas`);
  }
  mostrarPvTab('clasificacion');
}

function renderAvisoPendientes(lista) {
  const aviso = document.getElementById('avisoPendientesClasif');
  if (!aviso) return;
  if (!lista.length) { aviso.style.display = 'none'; aviso.innerHTML = ''; return; }

  const conteo = contarNumeros(getCompetidores());
  const max = 15;
  const items = lista.slice(0, max).map(c => {
    const faltan = faltantesCompetidor(c, conteo);
    const motivo = faltan.length ? `Falta: ${faltan.join(', ')}` : 'Subdivisión no coincide';
    return `<li>
      <strong>#${esVacio(c.numero) ? '—' : escapeHtml(c.numero)}</strong> ${escapeHtml(c.nombre)}
      <span class="aviso-cat">${escapeHtml(formatearNombreCategoria(claveCategoria(c.categoria)))} · ${escapeHtml(c.division)}</span>
      ${esInscripcionOnline(c) ? '<span class="tag tag-online">Online</span>' : ''}
      <span class="tag tag-falta">${escapeHtml(motivo)}</span>
    </li>`;
  }).join('');

  aviso.innerHTML = `
    <div class="aviso-titulo">⚠ ${lista.length} competidor${lista.length !== 1 ? 'es no aparecen' : ' no aparece'} en la clasificación</div>
    <p>Les faltan datos de pesaje o no tienen subdivisión válida. Complétalos y vuelve a generar.</p>
    <ul>${items}</ul>
    ${lista.length > max ? `<p class="aviso-mas">… y ${lista.length - max} más.</p>` : ''}
    <button type="button" class="btn-aviso" onclick="verPendientesEnLista()">Ver pendientes en la lista</button>
  `;
  aviso.style.display = 'block';
}

function verPendientesEnLista() {
  setFiltroEstado('incompletos');
  mostrarPvTab('competidores');
}

// ─── FORMULARIO EN TELÉFONO ───────────────────────────────
function esMovil() { return window.matchMedia('(max-width: 900px)').matches; }

function abrirFormularioMovil(seccion) {
  if (!esMovil()) return;
  const sb = document.getElementById('pvSidebar');
  if (!sb) return;
  sb.classList.add('abierto');
  document.body.classList.add('sheet-abierto');
  if (seccion === 'acciones') {
    setTimeout(() => document.getElementById('pvAcciones').scrollIntoView({ behavior: 'smooth' }), 250);
  } else {
    sb.scrollTop = 0;
  }
}

function cerrarFormularioMovil() {
  const sb = document.getElementById('pvSidebar');
  if (sb) sb.classList.remove('abierto');
  document.body.classList.remove('sheet-abierto');
}

// Cambia entre "Lista de Competidores" y "Clasificación Final"
function mostrarPvTab(nombre) {
  document.querySelectorAll('.pv-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === nombre));
  document.querySelectorAll('.pv-tab-content').forEach(c => c.classList.toggle('active', c.id === 'pvtab-' + nombre));
  const panel = document.getElementById('seccionClasificacion');
  if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ behavior: 'smooth' });
}

function crearTablaClasificacion(titulo, items, catNombre) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tabla-clasificacion';
  wrapper.dataset.titulo = titulo;
  wrapper.dataset.cat = catNombre;
  wrapper.dataset.snapshot = JSON.stringify(items);
  wrapper.innerHTML = buildTablaHTML(titulo, items, { catNombre });
  return wrapper;
}

function buildTablaHTML(titulo, items, opciones = {}) {
  const { esGrupo, catNombre = '' } = opciones;
  const c = catNombre.toLowerCase();
  const usaPeso = c.includes('bodybuilding') || c.includes('wheelchair') || c.includes('classic');
  const usaEstatura = !c.includes('bodybuilding') && !c.includes('wheelchair');

  const botonesHeader = esGrupo ? `
    <button type="button" class="btn btn-ghost btn-sm" onclick="deshacerDivision(this)">↩ Deshacer</button>
    <button type="button" class="btn btn-blue btn-sm" onclick="iniciarFusion(this)">⊕ Fusionar</button>` : `
    <button type="button" class="btn btn-yellow btn-sm" onclick="toggleDividir(this)">✂ Dividir en grupos</button>
    <button type="button" class="btn btn-blue btn-sm" onclick="iniciarFusion(this)">⊕ Fusionar</button>`;

  const partes = esGrupo ? titulo.split(' — ') : [titulo];
  const tituloHTML = esGrupo && partes.length > 1
    ? `${escapeHtml(partes[0])} — <span class="titulo-grupo">${escapeHtml(partes.slice(1).join(' — '))}</span>`
    : escapeHtml(titulo);

  const thPeso = usaPeso ? '<th class="col-pesaje" style="display:none">Peso (kg)</th>' : '';
  const thEst = usaEstatura ? '<th class="col-pesaje" style="display:none">Estatura (m)</th>' : '';

  const filas = items.map(it => {
    const tdPeso = usaPeso ? `<td class="col-pesaje col-peso" style="display:none">${esVacio(it.peso) ? '—' : escapeHtml(it.peso) + 'kg'}</td>` : '';
    const tdEst = usaEstatura ? `<td class="col-pesaje col-estatura" style="display:none">${esVacio(it.estatura) ? '—' : escapeHtml(it.estatura) + 'm'}</td>` : '';
    return `<tr><td><strong>${escapeHtml(it.numero)}</strong></td><td>${escapeHtml(it.nombre)}</td><td>${escapeHtml(it.ciudad)}</td>${tdPeso}${tdEst}<td class="td-puesto" contenteditable="true" inputmode="numeric" title="Haz clic para escribir el puesto"></td></tr>`;
  }).join('');

  const gruposHTML = esGrupo ? '' : `
    <div class="grupos-container" style="display:none">
      <div class="grupos-controls">
        <span>Dividir en</span>
        <input type="number" class="grupos-num-input" value="2" min="2" max="6">
        <span>grupos</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="aplicarDivision(this)">Aplicar división</button>
        <button type="button" class="btn btn-green btn-sm" onclick="confirmarDivision(this)">✓ Confirmar</button>
        <button type="button" class="btn btn-red-outline btn-sm" onclick="cancelarDivision(this)">✕ Cancelar</button>
      </div>
      <p class="grupos-hint">Arrastra a los atletas entre grupos (en el teléfono: toca un atleta y luego el grupo) antes de confirmar.</p>
      <div class="grupos-grid"></div>
    </div>`;

  return `
    <div class="tabla-header">
      <span class="tabla-titulo">${tituloHTML}</span>
      <div class="tabla-acciones">
        <span class="tabla-count">${items.length} competidor${items.length !== 1 ? 'es' : ''}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="togglePesaje(this)">⚖ Ver pesaje</button>
        ${botonesHeader}
      </div>
    </div>
    <div class="tabla-body">
      <table>
        <thead><tr><th>Número</th><th>Nombre</th><th>Ciudad</th>${thPeso}${thEst}<th>Puesto</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    ${gruposHTML}`;
}

function togglePesaje(btn) {
  const wrapper = btn.closest('.tabla-clasificacion');
  const cols = wrapper.querySelectorAll('.tabla-body .col-pesaje');
  const visible = cols.length > 0 && cols[0].style.display !== 'none';
  cols.forEach(col => { col.style.display = visible ? 'none' : ''; });
  btn.textContent = visible ? '⚖ Ver pesaje' : '⚖ Ocultar pesaje';
  btn.classList.toggle('btn-ghost', visible);
  btn.classList.toggle('btn-purple', !visible);
}

// ─── DIVIDIR EN GRUPOS (drag & drop) ──────────────────────
function toggleDividir(btn) {
  const wrapper = btn.closest('.tabla-clasificacion');
  const container = wrapper.querySelector('.grupos-container');
  if (container.style.display !== 'none') {
    container.style.display = 'none';
  } else {
    container.style.display = 'block';
    wrapper.querySelector('.grupos-grid').innerHTML = '';
    aplicarDivision(wrapper.querySelector('.grupos-num-input'));
  }
}

function aplicarDivision(el) {
  const wrapper = el.closest('.tabla-clasificacion');
  const numGrupos = Math.min(6, Math.max(2, parseInt(wrapper.querySelector('.grupos-num-input').value) || 2));
  const grid = wrapper.querySelector('.grupos-grid');

  let items = [];
  const zonasExistentes = grid.querySelectorAll('.grupo-zona');
  if (zonasExistentes.length) {
    zonasExistentes.forEach(zona => {
      zona.querySelectorAll('.drag-item').forEach(it => items.push(JSON.parse(it.dataset.item)));
    });
  } else {
    items = JSON.parse(wrapper.dataset.snapshot || '[]');
  }

  grid.innerHTML = '';
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < numGrupos; i++) {
    const zona = document.createElement('div');
    zona.className = 'grupo-zona';
    zona.dataset.nombre = `Grupo ${letras[i]}`;
    zona.innerHTML = `
      <div class="grupo-zona-header">Grupo ${letras[i]} <span class="grupo-cnt">0</span></div>
      <div class="grupo-items"></div>`;

    zona.addEventListener('click', () => {
      const sel = wrapper.querySelector('.drag-item.seleccionado');
      if (!sel) return;
      sel.classList.remove('seleccionado');
      if (sel.parentElement !== zona.querySelector('.grupo-items')) {
        zona.querySelector('.grupo-items').appendChild(sel);
        updateGroupCounts(wrapper);
      }
    });
    zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('drag-over'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('drag-over'));
    zona.addEventListener('drop', e => {
      e.preventDefault();
      zona.classList.remove('drag-over');
      if (dragSrc && wrapper.contains(dragSrc)) {
        zona.querySelector('.grupo-items').appendChild(dragSrc);
        dragSrc.classList.remove('dragging');
        updateGroupCounts(wrapper);
      }
    });
    grid.appendChild(zona);
  }

  items.forEach((item, idx) => {
    grid.children[idx % numGrupos].querySelector('.grupo-items').appendChild(crearDragItem(item));
  });
  updateGroupCounts(wrapper);
}

function crearDragItem(item) {
  const el = document.createElement('div');
  el.className = 'drag-item';
  el.draggable = true;
  el.dataset.item = JSON.stringify(item);
  el.innerHTML = `
    <span class="drag-handle">⠿</span>
    <span class="drag-num">${escapeHtml(item.numero)}</span>
    <span class="drag-name">${escapeHtml(item.nombre)}</span>
    <span class="drag-ciudad">${escapeHtml(item.ciudad)}</span>`;
  el.addEventListener('dragstart', () => { dragSrc = el; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => { dragSrc = null; el.classList.remove('dragging'); });
  // En teléfono: tocar el atleta y luego el grupo destino
  el.addEventListener('click', e => {
    e.stopPropagation();
    const yaSeleccionado = el.classList.contains('seleccionado');
    document.querySelectorAll('.drag-item.seleccionado').forEach(x => x.classList.remove('seleccionado'));
    if (!yaSeleccionado) el.classList.add('seleccionado');
  });
  return el;
}

function updateGroupCounts(wrapper) {
  wrapper.querySelectorAll('.grupo-zona').forEach(zona => {
    const n = zona.querySelectorAll('.drag-item').length;
    zona.querySelector('.grupo-cnt').textContent = `${n} competidor${n !== 1 ? 'es' : ''}`;
  });
}

function cancelarDivision(btn) {
  btn.closest('.tabla-clasificacion').querySelector('.grupos-container').style.display = 'none';
}

function confirmarDivision(btn) {
  const wrapper = btn.closest('.tabla-clasificacion');
  const tituloBase = wrapper.dataset.titulo;
  const catNombre = wrapper.dataset.cat || '';
  const zonas = [...wrapper.querySelectorAll('.grupo-zona')];

  if (zonas.some(z => !z.querySelector('.drag-item'))) {
    showToast('Hay grupos vacíos — mueve competidores antes de confirmar', 'warning');
    return;
  }

  const fragment = document.createDocumentFragment();
  zonas.forEach(zona => {
    const items = [...zona.querySelectorAll('.drag-item')].map(it => JSON.parse(it.dataset.item)).sort(porNumero);
    const titulo = `${tituloBase} — ${zona.dataset.nombre}`;
    const div = document.createElement('div');
    div.className = 'tabla-clasificacion';
    div.dataset.titulo = titulo;
    div.dataset.cat = catNombre;
    div.dataset.snapshot = JSON.stringify(items);
    div.dataset.tituloOriginal = tituloBase;
    div.innerHTML = buildTablaHTML(titulo, items, { esGrupo: true, catNombre });
    fragment.appendChild(div);
  });

  wrapper.replaceWith(fragment);
  showToast('División confirmada');
}

function deshacerDivision(btn) {
  const tablaGrupo = btn.closest('.tabla-clasificacion');
  const tituloOriginal = tablaGrupo.dataset.tituloOriginal;
  if (!tituloOriginal) return;

  const todas = [...document.querySelectorAll('.tabla-clasificacion')].filter(t => t.dataset.tituloOriginal === tituloOriginal);
  const items = [];
  todas.forEach(t => JSON.parse(t.dataset.snapshot || '[]').forEach(i => items.push(i)));
  items.sort(porNumero);

  const div = crearTablaClasificacion(tituloOriginal, items, tablaGrupo.dataset.cat || '');
  todas[0].parentNode.insertBefore(div, todas[0]);
  todas.forEach(t => t.remove());
  showToast('División deshecha');
}

// ─── FUSIÓN DE TABLAS ─────────────────────────────────────
let fusionOrigen = null;
let fusionSeleccionadas = new Set();

function iniciarFusion(btn) {
  cancelarFusion();
  const wrapper = btn.closest('.tabla-clasificacion');
  fusionOrigen = wrapper;
  fusionSeleccionadas = new Set([wrapper]);

  document.querySelectorAll('.tabla-clasificacion').forEach(t => {
    if (t === wrapper) {
      t.classList.add('fusion-origen');
    } else {
      t.classList.add('fusion-seleccionable');
      t.addEventListener('click', onFusionClick);
    }
  });

  document.getElementById('fusionBar').classList.add('active');
  actualizarMsgFusion();
}

function onFusionClick(e) {
  if (e.target.closest('button') || e.target.closest('[contenteditable]')) return;
  const tabla = e.currentTarget;
  if (fusionSeleccionadas.has(tabla)) {
    fusionSeleccionadas.delete(tabla);
    tabla.classList.remove('fusion-seleccionada');
  } else {
    fusionSeleccionadas.add(tabla);
    tabla.classList.add('fusion-seleccionada');
  }
  actualizarMsgFusion();
}

function actualizarMsgFusion() {
  const n = fusionSeleccionadas.size;
  document.getElementById('fusionMsg').textContent = n <= 1
    ? 'Haz clic en las tablas que quieres fusionar con la seleccionada'
    : `${n} tablas seleccionadas — listas para fusionar`;
  document.getElementById('fusionConfirmarBtn').disabled = n < 2;
}

function confirmarFusion() {
  if (fusionSeleccionadas.size < 2) { showToast('Selecciona al menos 2 tablas para fusionar', 'warning'); return; }

  const items = [];
  fusionSeleccionadas.forEach(t => JSON.parse(t.dataset.snapshot || '[]').forEach(i => items.push(i)));
  items.sort(porNumero);

  const div = crearTablaClasificacion(fusionOrigen.dataset.titulo, items, fusionOrigen.dataset.cat || '');
  fusionOrigen.parentNode.insertBefore(div, fusionOrigen);
  fusionSeleccionadas.forEach(t => t.remove());

  cancelarFusion();
  showToast(`${items.length} competidores fusionados en una tabla`);
}

function cancelarFusion() {
  document.querySelectorAll('.tabla-clasificacion').forEach(t => {
    t.classList.remove('fusion-seleccionable', 'fusion-seleccionada', 'fusion-origen');
    t.removeEventListener('click', onFusionClick);
  });
  const bar = document.getElementById('fusionBar');
  if (bar) bar.classList.remove('active');
  fusionOrigen = null;
  fusionSeleccionadas = new Set();
}

// ─── EXPORTAR CLASIFICACIÓN ───────────────────────────────
function exportarClasificacionFinal() {
  const tablas = document.querySelectorAll('.tabla-clasificacion');
  if (!tablas.length) { showToast('Primero genere la clasificación final', 'warning'); return; }

  const hojas = {};
  tablas.forEach(tabla => {
    const titulo = tabla.dataset.titulo || 'Tabla';
    const cat = tabla.dataset.cat || 'General';
    if (!hojas[cat]) hojas[cat] = [];

    const grupos = tabla.querySelectorAll('.grupo-zona');
    const cont = tabla.querySelector('.grupos-container');
    const gruposAbiertos = grupos.length > 0 && cont && cont.style.display !== 'none';

    hojas[cat].push([titulo]);
    if (gruposAbiertos) {
      grupos.forEach(zona => {
        hojas[cat].push([zona.dataset.nombre]);
        hojas[cat].push(['NÚMERO', 'NOMBRE', 'CIUDAD', 'PUESTO']);
        zona.querySelectorAll('.drag-item').forEach(it => {
          const d = JSON.parse(it.dataset.item);
          hojas[cat].push([d.numero, d.nombre, d.ciudad, '']);
        });
        hojas[cat].push([]);
      });
    } else {
      hojas[cat].push(['NÚMERO', 'NOMBRE', 'CIUDAD', 'PUESTO']);
      tabla.querySelectorAll('.tabla-body tbody tr').forEach(row => {
        const puesto = row.querySelector('.td-puesto')?.textContent.trim() || '';
        hojas[cat].push([row.cells[0].textContent.trim(), row.cells[1].textContent.trim(), row.cells[2].textContent.trim(), puesto]);
      });
      hojas[cat].push([]);
    }
  });

  const wb = XLSX.utils.book_new();
  Object.entries(hojas).forEach(([cat, rows]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, cat.replace(/[\\\/?*\[\]:]/g, '').substring(0, 31));
  });
  XLSX.writeFile(wb, `clasificacion_final_${hoy()}.xlsx`);
  showToast('Clasificación exportada');
}

// Exportar globalmente funciones llamadas desde HTML
window.editCompetidor = editCompetidor;
window.deleteCompetidor = deleteCompetidor;
window.verComprobante = verComprobante;
window.verMusica = verMusica;
window.togglePesaje = togglePesaje;
window.toggleDividir = toggleDividir;
window.aplicarDivision = aplicarDivision;
window.cancelarDivision = cancelarDivision;
window.confirmarDivision = confirmarDivision;
window.deshacerDivision = deshacerDivision;
window.iniciarFusion = iniciarFusion;
window.confirmarFusion = confirmarFusion;
window.cancelarFusion = cancelarFusion;
window.verPendientesEnLista = verPendientesEnLista;
window.mostrarPvTab = mostrarPvTab;
