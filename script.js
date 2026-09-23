// ====== SUPABASE CONFIGURACIÓN ======
const supabaseUrl = "https://djceavyhjkrqvsvellke.supabase.co";
const supabaseAnonKey = "sb_publishable_WT7LbFYCjIAWTo__N360KQ_Erdh1-Y8";

let supabaseClient = null;

async function fetchAllFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('competidores').select('*').order('id', { ascending: true });
    if (error) throw error;
    if (data) {
      localStorage.setItem('competidores', JSON.stringify(data));
      loadCompetitors();
    }
  } catch (err) {
    console.error("Error descargando de Supabase:", err);
  }
}

async function syncCompetidorToSupabase(comp, borrar = false) {
  if (!supabaseClient) return;
  try {
    if (borrar) {
      await supabaseClient.from('competidores').delete().eq('cedula', comp.cedula);
      return;
    }
    // Revisar si existe
    const { data } = await supabaseClient.from('competidores').select('id').eq('cedula', comp.cedula);
    if (data && data.length > 0) {
      const { id, ...updateData } = comp;
      await supabaseClient.from('competidores').update(updateData).eq('cedula', comp.cedula);
    } else {
      const { id, ...insertData } = comp;
      await supabaseClient.from('competidores').insert(insertData);
    }
  } catch (err) {
    console.error("Error sincronizando competidor a Supabase:", err);
  }
}
// ===================================

let editMode = false;
let editId = null;

// Variables de estado para archivos del formulario de inscripción
let comprobanteArchivo = {
  dataUrl: null,
  nombre: '',
  tipo: ''
};

let musicaArchivo = {
  nombre: '',
  url: null
};

function normalizarDivision(division) {
  if (!division) return 'Novato';
  return division
    .replace('Pre-juvenil', 'Prejuvenil')
    .replace('Prejuvenil', 'Prejuvenil')
    .replace('Semi Novato', 'Semi-novatos')
    .replace('Seminovato', 'Semi-novatos')
    .replace('Juvenil', 'Juvenil')
    .replace('Novato', 'Novato')
    .replace('Avanzado', 'Avanzado')
    .replace('Master', 'Master');
}

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
    } else {
      console.warn("SDK de Supabase no disponible. Usando almacenamiento local.");
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
    comprobanteArchivo = { dataUrl: null, nombre: '', tipo: '' };
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
      const reader = new FileReader();
      reader.onload = (ev) => {
        comprobanteArchivo.dataUrl = ev.target.result;
        imgPreview.src = ev.target.result;
        imgPreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      // PDF o documento
      imgPreview.style.display = 'none';
      comprobanteArchivo.dataUrl = 'data:application/pdf;base64,placeholder';
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
      musicaArchivo.url = URL.createObjectURL(file);
      musicaFileName.textContent = `Pista MP3: ${file.name}`;
      musicaAudioPreview.src = musicaArchivo.url;
      musicaPreviewContainer.style.display = 'flex';
    }
  });

  removerMusicaBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    musicaArchivo = { nombre: '', url: null };
    regMusica.value = '';
    musicaAudioPreview.src = '';
    musicaPreviewContainer.style.display = 'none';
    musicaFileName.textContent = '';
  });

  // Envío del formulario oficial de inscripción
  formInscripcion.addEventListener('submit', (e) => {
    e.preventDefault();

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
      comprobanteUrl: comprobanteArchivo.dataUrl || '',
      comprobanteNombre: comprobanteArchivo.nombre || '',
      musicaNombre: musicaArchivo.nombre || '',
      radicado: radicadoCode,
      fechaInscripcion: new Date().toLocaleDateString('es-CO')
    };

    if (indexExistente !== -1) {
      competidores[indexExistente] = { ...competidores[indexExistente], ...nuevoCompetidor };
      syncCompetidorToSupabase(competidores[indexExistente]);
    } else {
      competidores.push(nuevoCompetidor);
      syncCompetidorToSupabase(nuevoCompetidor);
    }

    saveCompetidores(competidores);

    // Mostrar modal con ticket de atleta
    mostrarTicketAtleta(nuevoCompetidor);

    // Limpiar formulario
    formInscripcion.reset();
    comprobanteArchivo = { dataUrl: null, nombre: '', tipo: '' };
    previewContainer.style.display = 'none';
    imgPreview.src = '';
    fileNameSpan.textContent = '';
    musicaArchivo = { nombre: '', url: null };
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
   PANEL DE JUECES Y PESAJE (FUNCIONES EXISTENTES OPTIMIZADAS)
   ========================================================================== */

function setupEventListeners() {
  document.getElementById('borrarTodosBtn').addEventListener('click', borrarTodosLosCompetidores);
  
  document.getElementById('categoria').addEventListener('change', function() {
    const categoria = this.value;
    const pesoContainer = document.getElementById('pesoContainer');
    const estaturaContainer = document.getElementById('estaturaContainer');
    
    if (categoria === 'bodybuilding' || categoria === 'wheelchair') {
      pesoContainer.style.display = 'block';
      estaturaContainer.style.display = 'none';
      document.getElementById('estatura').value = '';
    } else if (categoria === 'classic_physique') {
      pesoContainer.style.display = 'block';
      estaturaContainer.style.display = 'block';
    } else if (categoria === 'mens_physique') {
      pesoContainer.style.display = 'none';
      estaturaContainer.style.display = 'block';
      document.getElementById('peso').value = '';
    } else {
      pesoContainer.style.display = 'none';
      estaturaContainer.style.display = 'block';
      document.getElementById('peso').value = '';
    }
    
    document.getElementById('subdivisionContainer').style.display = 'none';
  });

  document.getElementById('division').addEventListener('change', function() {
    const division = this.value;
    const subdivisionContainer = document.getElementById('subdivisionContainer');
    subdivisionContainer.style.display = (division === 'Novato' || division === 'Avanzado') ? 'block' : 'none';
    if (division !== 'Novato' && division !== 'Avanzado') {
      document.getElementById('subdivision').value = '';
    }
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
  if (btnCancelarEdicion) {
    btnCancelarEdicion.addEventListener('click', resetForm);
  }

  document.getElementById('buscador').addEventListener('input', function() {
    const filtro = this.value.toLowerCase();
    document.querySelectorAll('#competidorTable tbody tr').forEach(row => {
      row.style.display = row.innerText.toLowerCase().includes(filtro) ? '' : 'none';
    });
  });

  document.getElementById('competidorForm').addEventListener('submit', function(e) {
    e.preventDefault();
    handleFormSubmit();
  });

  // Modal para ver comprobante
  const btnCerrarVerComprobante = document.getElementById('btnCerrarVerComprobante');
  if (btnCerrarVerComprobante) {
    btnCerrarVerComprobante.addEventListener('click', () => {
      document.getElementById('verComprobanteModal').style.display = 'none';
    });
  }
}

function clasificarAutomaticamente() {
  const categoria = document.getElementById('categoria').value;
  const peso = parseFloat(document.getElementById('peso').value) || 0;
  const estatura = parseFloat(document.getElementById('estatura').value) || 0;
  const division = document.getElementById('division').value;
  
  if (!categoria) {
    alert('Seleccione una categoría primero');
    return false;
  }

  const resultado = calcularSubdivision(categoria, division, peso, estatura);
  
  if (resultado.error) {
    alert(resultado.error);
    return false;
  }

  document.getElementById('subdivision').value = resultado.subdivision || '';
  document.getElementById('subdivisionContainer').style.display = (division === 'Novato' || division === 'Avanzado') ? 'block' : 'none';
  return true;
}

function clasificarTodos() {
  if (!confirm("¿Clasificar automáticamente TODOS los competidores?\nEsta acción actualizará solo las subdivisiones.")) return;
  
  const competidores = getCompetidores();
  let competidoresInvalidos = 0;
  
  const competidoresClasificados = competidores.map(competidor => {
    const resultado = calcularSubdivision(
      competidor.categoria, 
      competidor.division,
      parseFloat(competidor.peso) || 0, 
      parseFloat(competidor.estatura) || 0
    );
    
    if (resultado.error) {
      competidoresInvalidos++;
      return competidor;
    }
    
    return {
      ...competidor,
      subdivision: resultado.subdivision || 'No aplica'
    };
  });
  
  if (competidoresInvalidos > 0) {
    alert(`Se actualizaron ${competidores.length - competidoresInvalidos} competidores.\n${competidoresInvalidos} competidores no cumplen con los parámetros requeridos.`);
  } else {
    alert(`Se han actualizado las subdivisiones de ${competidores.length} competidores`);
  }
  
  saveCompetidores(competidoresClasificados);
  loadCompetitors();
}

function calcularSubdivision(categoria, division, peso, estatura) {
  if (division !== 'Novato' && division !== 'Avanzado') {
    return { subdivision: 'No aplica' };
  }
  
  let subdivision = '';
  let error = '';
  
  switch(categoria) {
    case 'mens_physique':
      if (estatura <= 0) {
        error = 'La estatura debe ser mayor que 0 para Men\'s Physique';
      } else {
        subdivision = calcularSubdivisionMenPhysique(estatura);
      }
      break;
      
    case 'bodybuilding':
    case 'wheelchair':
      if (peso <= 0) {
        error = 'El peso debe ser mayor que 0 para esta categoría';
      } else {
        subdivision = calcularSubdivisionBodybuilding(peso);
      }
      break;
      
    case 'classic_physique':
      if (estatura <= 0 || peso <= 0) {
        error = 'La estatura y el peso deben ser mayores que 0 para Classic Physique';
      } else {
        const resultado = calcularSubdivisionClassicPhysique(estatura, peso);
        if (resultado.error) {
          error = resultado.error;
        } else {
          subdivision = resultado.subdivision;
        }
      }
      break;
      
    case 'bikini':
    case 'wellness':
    case 'figure':
    case 'fit_model':
    case 'womans_physique':
      if (estatura <= 0) {
        error = 'La estatura debe ser mayor que 0 para esta categoría';
      } else {
        subdivision = calcularSubdivisionPorEstatura(estatura);
      }
      break;
      
    default:
      return { subdivision: 'No aplica' };
  }
  
  if (error) {
    return { error };
  }
  
  return { subdivision };
}

function calcularSubdivisionMenPhysique(estatura) {
  if (estatura <= 1.70) return 'Hasta 1.70m';
  if (estatura <= 1.75) return '1.70-1.75m';
  if (estatura <= 1.80) return '1.75-1.80m';
  return 'Más de 1.80m';
}

function calcularSubdivisionBodybuilding(peso) {
  if (peso <= 70) return 'Hasta 70kg';
  if (peso <= 80) return '70-80kg';
  if (peso <= 90) return '80-90kg';
  return 'Más de 90kg';
}

function calcularSubdivisionClassicPhysique(estatura, peso) {
  if (estatura <= 1.70) {
    if (peso > 79) {
      return { error: `Para estatura ≤1.70m en Classic Physique, el peso máximo es 79kg (actual: ${peso}kg)` };
    }
    return { subdivision: 'Clase A (≤1.70m, ≤79kg)' };
  }
  
  if (estatura <= 1.78) {
    if (peso > 89) {
      return { error: `Para estatura ≤1.78m en Classic Physique, el peso máximo es 89kg (actual: ${peso}kg)` };
    }
    return { subdivision: 'Clase B (≤1.78m, ≤89kg)' };
  }
  
  if (estatura <= 1.83) {
    if (peso > 96) {
      return { error: `Para estatura ≤1.83m en Classic Physique, el peso máximo es 96kg (actual: ${peso}kg)` };
    }
    return { subdivision: 'Clase C (≤1.83m, ≤96kg)' };
  }
  
  if (peso > 125) {
    return { error: `Para estatura >1.83m en Classic Physique, el peso máximo es 125kg (actual: ${peso}kg)` };
  }
  return { subdivision: 'Clase D (>1.83m, >96kg)' };
}

function calcularSubdivisionPorEstatura(estatura) {
  if (estatura <= 1.60) return 'Hasta 1.60m';
  if (estatura <= 1.65) return '1.60-1.65m';
  if (estatura <= 1.70) return '1.65-1.70m';
  if (estatura <= 1.75) return '1.70-1.75m';
  return 'Más de 1.75m';
}

function handleFormSubmit() {
  const competidorData = {
    numero: document.getElementById('numero').value,
    nombre: document.getElementById('nombre').value,
    cedula: document.getElementById('cedula').value,
    ciudad: document.getElementById('ciudad').value,
    categoria: document.getElementById('categoria').value,
    peso: document.getElementById('peso').value || 'N/A',
    estatura: document.getElementById('estatura').value || 'N/A',
    division: document.getElementById('division').value,
    subdivision: document.getElementById('subdivision').value || 'No aplica',
    pago: document.getElementById('estadoPago').value || 'Pendiente',
    asistencia: document.getElementById('estadoAsistencia').value || 'Pendiente'
  };

  if (!validarCompetidor(competidorData)) return;

  if (competidorData.division === 'Novato' || competidorData.division === 'Avanzado') {
    const peso = parseFloat(competidorData.peso) || 0;
    const estatura = parseFloat(competidorData.estatura) || 0;
    const resultado = calcularSubdivision(competidorData.categoria, competidorData.division, peso, estatura);
    
    if (resultado.error) {
      alert(`Error en parámetros: ${resultado.error}\nNo se puede guardar el competidor.`);
      return;
    }
    
    competidorData.subdivision = resultado.subdivision;
  }

  if (editMode) {
    updateCompetidor(editId, competidorData);
  } else {
    addCompetidor(competidorData);
  }

  resetForm();
}

function validarCompetidor(data) {
  if (!data.numero || !data.nombre || !data.cedula || !data.ciudad || !data.categoria || !data.division) {
    alert('Complete todos los campos requeridos');
    return false;
  }
  
  if (data.categoria === 'bodybuilding' || data.categoria === 'wheelchair') {
    if (data.peso === 'N/A') {
      alert('Ingrese el peso para esta categoría');
      return false;
    }
  } else if (data.categoria === 'classic_physique') {
    if (data.peso === 'N/A' || data.estatura === 'N/A') {
      alert('Ingrese peso y estatura para Classic Physique');
      return false;
    }
  } else {
    if (data.estatura === 'N/A') {
      alert('Ingrese la estatura para esta categoría');
      return false;
    }
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
  // Conservar comprobante y música si ya existían
  const anterior = competidores[id] || {};
  const updatedComp = {
    ...anterior,
    ...newData
  };
  competidores[id] = updatedComp;
  saveCompetidores(competidores);
  syncCompetidorToSupabase(updatedComp);
  loadCompetitors();
  editMode = false;
  editId = null;
}

function deleteCompetidor(id) {
  if (!confirm("¿Borrar este competidor?")) return;
  
  const competidores = getCompetidores();
  const deletedComp = competidores[id];
  competidores.splice(id, 1);
  saveCompetidores(competidores);
  if (deletedComp) syncCompetidorToSupabase(deletedComp, true);
  loadCompetitors();
}

function getCompetidores() {
  return JSON.parse(localStorage.getItem('competidores')) || [];
}

function saveCompetidores(competidores) {
  localStorage.setItem('competidores', JSON.stringify(competidores));
}

function loadCompetitors() {
  const competidores = getCompetidores();
  const tbody = document.querySelector('#competidorTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  competidores.forEach((data, index) => addRowToTable(data, index));
  actualizarDashboardFinanciero(competidores);
}

function actualizarDashboardFinanciero(competidores) {
  const statTotal = document.getElementById('statTotalAtletas');
  const statEnSitio = document.getElementById('statEnSitio');
  const statRecaudado = document.getElementById('statRecaudado');
  
  if (!statTotal || !statEnSitio || !statRecaudado) return;

  const costoInscripcion = 200000;
  let totalEnSitio = 0;
  let totalRecaudado = 0;

  competidores.forEach(comp => {
    if (comp.asistencia === 'Pesado' || comp.asistencia === 'En fila') {
      totalEnSitio++;
    }
    if (comp.pago === 'Pagado Online' || comp.pago === 'Pagado Efectivo') {
      totalRecaudado += costoInscripcion;
    }
  });

  statTotal.textContent = competidores.length;
  statEnSitio.textContent = totalEnSitio;
  statRecaudado.textContent = '$' + totalRecaudado.toLocaleString('es-CO');
}

function addRowToTable(data, index) {
  const row = document.createElement('tr');
  const catFormateada = formatearNombreCategoria(data.categoria);
  
  let comprobanteHtml = '<span style="color:#777;">Sin archivo</span>';
  if (data.comprobanteUrl || data.comprobanteNombre) {
    comprobanteHtml = `<button type="button" class="btn-ver-comprobante" onclick="verComprobante(${index})"> Ver Comprobante</button>`;
  }

  const pagoClass = data.pago === 'Pendiente' ? 'color: #ff3333;' : 'color: #4caf50;';
  const asistenciaClass = data.asistencia === 'Pesado' ? 'color: #4caf50;' : (data.asistencia === 'En fila' ? 'color: #e5a93b;' : 'color: #aaa;');

  row.innerHTML = `
    <td><strong>${data.numero}</strong></td>
    <td>${data.nombre}</td>
    <td>${data.cedula}</td>
    <td>${data.ciudad}</td>
    <td>${catFormateada}</td>
    <td>${data.peso}</td>
    <td>${data.estatura}</td>
    <td>${data.division}</td>
    <td>${data.subdivision || 'No aplica'}</td>
    <td style="font-weight: bold; ${pagoClass}">${data.pago || 'Pendiente'}</td>
    <td style="font-weight: bold; ${asistenciaClass}">${data.asistencia || 'Pendiente'}</td>
    <td>${comprobanteHtml}</td>
    <td class="actions">
      <button onclick="editCompetidor(${index})">Editar</button>
      <button onclick="deleteCompetidor(${index})">Borrar</button>
    </td>
  `;
  document.querySelector('#competidorTable tbody').appendChild(row);
}

function verComprobante(index) {
  const competidores = getCompetidores();
  const comp = competidores[index];
  if (!comp) return;

  const modal = document.getElementById('verComprobanteModal');
  const modalSubtitle = document.getElementById('comprobanteModalSubtitle');
  const modalBody = document.getElementById('comprobanteModalBody');

  modalSubtitle.textContent = `Atleta: ${comp.nombre} (C.C. ${comp.cedula})`;

  if (comp.comprobanteUrl && comp.comprobanteUrl.startsWith('data:image')) {
    modalBody.innerHTML = `
      <img src="${comp.comprobanteUrl}" alt="Comprobante" style="max-width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid #444;">
      <p style="margin-top: 10px; color: #aaa; font-size: 13px;">${comp.comprobanteNombre || 'Imagen de comprobante'}</p>
    `;
  } else {
    modalBody.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 10px;"></div>
      <p style="color: #f5b027; font-weight: bold;">${comp.comprobanteNombre || 'Comprobante en documento / PDF'}</p>
      <p style="color: #aaa; font-size: 13px; margin-top: 6px;">Comprobante registrado y validado satisfactoriamente.</p>
    `;
  }

  modal.style.display = 'flex';
}

function editCompetidor(index) {
  const competidores = getCompetidores();
  const data = competidores[index];
  
  document.getElementById('numero').value = data.numero;
  document.getElementById('nombre').value = data.nombre;
  document.getElementById('cedula').value = data.cedula;
  document.getElementById('ciudad').value = data.ciudad;
  document.getElementById('categoria').value = data.categoria;
  
  const event = new Event('change');
  document.getElementById('categoria').dispatchEvent(event);
  
  document.getElementById('peso').value = (data.peso && data.peso !== 'N/A') ? data.peso : '';
  document.getElementById('estatura').value = (data.estatura && data.estatura !== 'N/A') ? data.estatura : '';
  document.getElementById('division').value = data.division;
  document.getElementById('subdivision').value = (data.subdivision && data.subdivision !== 'No aplica' && data.subdivision !== 'Pendiente de pesaje') ? data.subdivision : '';
  
  document.getElementById('estadoPago').value = data.pago || 'Pendiente';
  document.getElementById('estadoAsistencia').value = data.asistencia || 'Pendiente';
  
  document.getElementById('subdivisionContainer').style.display = 
    (data.division === 'Novato' || data.division === 'Avanzado') ? 'block' : 'none';
  
  editMode = true;
  editId = index;

  const btnCancelar = document.getElementById('btnCancelarEdicion');
  if (btnCancelar) btnCancelar.style.display = 'block';

  const formTitle = document.getElementById('formTitleText');
  if (formTitle) formTitle.textContent = `Editando Competidor #${data.numero} - ${data.nombre}`;

  document.getElementById('competidorForm').scrollIntoView({ behavior: 'smooth' });
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

  const formTitle = document.getElementById('formTitleText');
  if (formTitle) formTitle.textContent = "Registro y Pesaje en Sitio";
}

function exportarJson() {
  const competidores = getCompetidores();
  if (competidores.length === 0) {
    alert("No hay datos para exportar");
    return;
  }

  const blob = new Blob([JSON.stringify(competidores, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `competidores_vikingos_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportarExcel() {
  const competidores = getCompetidores();
  if (competidores.length === 0) {
    alert("No hay datos para exportar");
    return;
  }

  const datosFormateados = competidores.map(comp => ({
    "Radicado": comp.radicado || 'N/A',
    "Número": comp.numero,
    "Nombre": comp.nombre,
    "Cédula": comp.cedula,
    "Correo": comp.correo || 'N/A',
    "Celular": comp.celular || 'N/A',
    "Ciudad": comp.ciudad,
    "Categoría": formatearNombreCategoria(comp.categoria),
    "Peso (kg)": comp.peso === 'N/A' ? '' : comp.peso,
    "Estatura (m)": comp.estatura === 'N/A' ? '' : comp.estatura,
    "División": comp.division,
    "Subdivisión": comp.subdivision,
    "Comprobante": comp.comprobanteNombre || 'No adjunto'
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Competidores");
  XLSX.writeFile(workbook, `competidores_vikingos_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function importarDatos(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = (event) => {
    try {
      let datos = [];
      
      if (file.name.endsWith('.xlsx')) {
        const workbook = XLSX.read(event.target.result, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        datos = XLSX.utils.sheet_to_json(firstSheet).map(row => ({
          numero: row["Número"] || generarNumeroUnico(),
          nombre: row["Nombre"] || 'Sin nombre',
          cedula: row["Cédula"] || 'Sin cédula',
          ciudad: row["Ciudad"] || 'Sin ciudad',
          categoria: (row["Categoría"] || 'bodybuilding').toLowerCase().replace(/ /g, '_'),
          peso: row["Peso (kg)"] !== undefined ? row["Peso (kg)"] : 'N/A',
          estatura: row["Estatura (m)"] !== undefined ? row["Estatura (m)"] : 'N/A',
          division: row["División"] || 'Novato',
          subdivision: row["Subdivisión"] || 'No aplica'
        }));
      } else {
        datos = JSON.parse(event.target.result).map(item => ({
          numero: item.numero || generarNumeroUnico(),
          nombre: item.nombre || 'Sin nombre',
          cedula: item.cedula || 'Sin cédula',
          ciudad: item.ciudad || 'Sin ciudad',
          categoria: item.categoria || 'bodybuilding',
          peso: item.peso !== undefined ? item.peso : 'N/A',
          estatura: item.estatura !== undefined ? item.estatura : 'N/A',
          division: item.division || 'Novato',
          subdivision: item.subdivision || 'No aplica',
          comprobanteNombre: item.comprobanteNombre || '',
          comprobanteUrl: item.comprobanteUrl || ''
        }));
      }

      if (!Array.isArray(datos)) throw new Error("Formato inválido");
      
      if (confirm(`¿Importar ${datos.length} registros? Se reemplazarán los datos actuales.`)) {
        saveCompetidores(datos);
        loadCompetitors();
        alert("¡Datos importados correctamente!");
      }
    } catch (error) {
      alert(`Error al importar: ${error.message}`);
    }
    e.target.value = '';
  };

  if (file.name.endsWith('.xlsx')) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function generarNumeroUnico() {
  return Math.floor(Math.random() * 900) + 100;
}

function generarClasificacionFinal() {
  const competidores = getCompetidores();
  if (competidores.length === 0) {
    alert("No hay competidores registrados para generar la clasificación");
    return;
  }

  // Normalizar datos primero
  const competidoresNormalizados = competidores.map(c => {
    const divisionNormalizada = normalizarDivision(c.division);
    const categoriaNormalizada = c.categoria.toLowerCase().replace("men's", 'mens').replace("woman's", 'womans');
    
    return { 
      ...c, 
      division: divisionNormalizada,
      categoria: categoriaNormalizada
    };
  });

  const contenedor = document.getElementById('tablasClasificacion');
  contenedor.innerHTML = '';

  // Estructura completa de categorías
  const categorias = [
    {
      nombre: 'CLASSIC PHYSIQUE',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Clase A (≤1.70m, ≤79kg)', 'Clase B (≤1.78m, ≤89kg)', 'Clase C (≤1.83m, ≤96kg)', 'Clase D (>1.83m, >96kg)'] },
        { nombre: 'Avanzado', subdivisiones: ['Clase A (≤1.70m, ≤79kg)', 'Clase B (≤1.78m, ≤89kg)', 'Clase C (≤1.83m, ≤96kg)', 'Clase D (>1.83m, >96kg)'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'BODYBUILDING',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 70kg', '70-80kg', '80-90kg', 'Más de 90kg'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 70kg', '70-80kg', '80-90kg', 'Más de 90kg'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'MEN\'S PHYSIQUE',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.70m', '1.70-1.75m', '1.75-1.80m', 'Más de 1.80m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.70m', '1.70-1.75m', '1.75-1.80m', 'Más de 1.80m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'WELLNESS',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'BIKINI',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'FIGURE',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'FIT MODEL',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'WOMAN\'S PHYSIQUE',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.60m', '1.60-1.65m', '1.65-1.70m', '1.70-1.75m', 'Más de 1.75m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    },
    {
      nombre: 'WHEELCHAIR',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: [] },
        { nombre: 'Avanzado', subdivisiones: [] },  
        { nombre: 'Master', subdivisiones: [] }
      ]
    }
  ];

  let contadorTablas = 1;
  let tablasGeneradas = [];

  categorias.forEach(categoria => {
    categoria.divisiones.forEach(division => {
      if (division.subdivisiones && division.subdivisiones.length > 0) {
        division.subdivisiones.forEach(subdivision => {
          const tabla = generarTablaClasificacion(
            competidoresNormalizados,
            categoria.nombre,
            division.nombre,
            subdivision,
            contadorTablas
          );
          if (tabla) {
            tablasGeneradas.push(tabla);
            contadorTablas++;
          }
        });
      } else {
        const tabla = generarTablaClasificacion(
          competidoresNormalizados,
          categoria.nombre,
          division.nombre,
          '',
          contadorTablas
        );
        if (tabla) {
          tablasGeneradas.push(tabla);
          contadorTablas++;
        }
      }
    });
  });

  tablasGeneradas.sort((a, b) => a.numero - b.numero);
  tablasGeneradas.forEach(tabla => {
    contenedor.appendChild(tabla.elemento);
  });

  verificarCompetidoresNoClasificados(competidoresNormalizados);
  document.getElementById('clasificacionFinalContainer').style.display = 'block';
}

function generarTablaClasificacion(competidores, categoria, division, subdivision = '', numeroTabla = 0) {
  const categoriaFormatoDatos = categoria.toLowerCase().replace(/ /g, '_').replace("men's", 'mens').replace("woman's", 'womans');
  
  let filtrados = competidores.filter(comp => {
    const categoriaMatch = comp.categoria === categoriaFormatoDatos;
    
    const divisionVariantes = [
      division.toLowerCase(),
      division.toLowerCase().replace('-', ' '),
      division.toLowerCase().replace(' ', '-')
    ];
    
    const divisionMatch = divisionVariantes.includes(comp.division.toLowerCase());
    
    let subdivisionMatch = true;
    if (subdivision) {
      subdivisionMatch = comp.subdivision && 
                       comp.subdivision.toLowerCase().includes(subdivision.toLowerCase());
    }
    
    return categoriaMatch && divisionMatch && subdivisionMatch;
  }).sort((a, b) => parseInt(a.numero) - parseInt(b.numero));

  if (filtrados.length === 0) return null;

  const tabla = document.createElement('div');
  tabla.className = 'clasificacion-table';
  
  let titulo = `${numeroTabla}. ${categoria.toUpperCase()} - ${division.toUpperCase()}`;
  if (subdivision) titulo += ` ${subdivision.toUpperCase()}`;
  
  tabla.innerHTML = `
    <h3>${titulo}</h3>
    <table>
      <thead>
        <tr>
          <th>NUMERO</th>
          <th>NOMBRE</th>
          <th>CIUDAD</th>
          <th>PUESTO</th>
        </tr>
      </thead>
      <tbody>
        ${filtrados.map(comp => `
          <tr>
            <td><strong>${comp.numero}</strong></td>
            <td>${comp.nombre}</td>
            <td>${comp.ciudad}</td>
            <td></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  return { numero: numeroTabla, elemento: tabla };
}

function verificarCompetidoresNoClasificados(competidores) {
  const clasificados = new Set();
  document.querySelectorAll('#tablasClasificacion td:nth-child(1)').forEach(td => {
    if (td.textContent.trim()) clasificados.add(parseInt(td.textContent));
  });

  const noClasificados = competidores.filter(c => !clasificados.has(parseInt(c.numero)));
  
  if (noClasificados.length > 0) {
    console.warn('Competidores no clasificados:', noClasificados);
  }
}

function exportarClasificacionFinal() {
  const tablas = document.querySelectorAll('.clasificacion-table');
  if (tablas.length === 0) {
    alert("Primero genere la clasificación final");
    return;
  }

  const hojasPorCategoria = {};

  tablas.forEach(tabla => {
    const titulo = tabla.querySelector('h3').textContent;
    const htmlTable = tabla.querySelector('table');
    const categoria = titulo.split('.')[1].split('-')[0].trim();

    if (!hojasPorCategoria[categoria]) {
      hojasPorCategoria[categoria] = [];
    }

    const headers = [...htmlTable.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const rows = [...htmlTable.querySelectorAll('tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
    );

    hojasPorCategoria[categoria].push([titulo]);
    hojasPorCategoria[categoria].push(headers);
    rows.forEach(row => hojasPorCategoria[categoria].push(row));
    hojasPorCategoria[categoria].push([]);
  });

  const workbook = XLSX.utils.book_new();

  Object.entries(hojasPorCategoria).forEach(([categoria, contenido]) => {
    const hoja = XLSX.utils.aoa_to_sheet(contenido);
    hoja['!cols'] = [
      { wch: 10 },
      { wch: 30 },
      { wch: 20 },
      { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, hoja, categoria.substring(0, 31));
  });

  XLSX.writeFile(workbook, `clasificacion_final_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function borrarTodosLosCompetidores() {
  const competidores = getCompetidores();
  
  if (competidores.length === 0) {
    alert("No hay competidores para borrar");
    return;
  }
  
  if (confirm(`¿ESTÁ SEGURO DE QUE DESEA BORRAR TODOS LOS ${competidores.length} COMPETIDORES?\n\nEsta acción no se puede deshacer.`)) {
    if (confirm("¿REALMENTE ESTÁ SEGURO? Esta acción eliminará permanentemente todos los datos.")) {
      localStorage.removeItem('competidores');
      loadCompetitors();
      alert(`Se han borrado todos los ${competidores.length} competidores`);
      document.getElementById('clasificacionFinalContainer').style.display = 'none';
    }
  }
}

// Exportar globalmente funciones llamadas desde HTML
window.editCompetidor = editCompetidor;
window.deleteCompetidor = deleteCompetidor;
window.verComprobante = verComprobante;
window.borrarTodosLosCompetidores = borrarTodosLosCompetidores;