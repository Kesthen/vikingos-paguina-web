let editMode = false;
let editId = null;


function normalizarDivision(division) {
  return division
    .replace('Prejuvenil', 'Prejuvenil')
    .replace('Semi Novato', 'Semi-novatos')
    .replace('Seminovato', 'Semi-novatos')
    .replace('Juvenil', 'Juvenil')
    .replace('Novato', 'Novato')
    .replace('Avanzado', 'Avanzado')
    .replace('Master', 'Master');
}

document.addEventListener('DOMContentLoaded', () => {
  loadCompetitors();
  setupEventListeners();
});

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
    subdivision: document.getElementById('subdivision').value || 'No aplica'
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
  addRowToTable(data, competidores.length - 1);
}

function updateCompetidor(id, newData) {
  const competidores = getCompetidores();
  competidores[id] = newData;
  saveCompetidores(competidores);
  loadCompetitors();
  editMode = false;
  editId = null;
}

function deleteCompetidor(id) {
  if (!confirm("¿Borrar este competidor?")) return;
  
  const competidores = getCompetidores();
  competidores.splice(id, 1);
  saveCompetidores(competidores);
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
  tbody.innerHTML = '';
  
  competidores.forEach((data, index) => addRowToTable(data, index));
}

function addRowToTable(data, index) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${data.numero}</td>
    <td>${data.nombre}</td>
    <td>${data.cedula}</td>
    <td>${data.ciudad}</td>
    <td>${data.categoria}</td>
    <td>${data.peso}</td>
    <td>${data.estatura}</td>
    <td>${data.division}</td>
    <td>${data.subdivision}</td>
    <td class="actions">
      <button onclick="editCompetidor(${index})">Editar</button>
      <button onclick="deleteCompetidor(${index})">Borrar</button>
    </td>
  `;
  document.querySelector('#competidorTable tbody').appendChild(row);
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
  
  document.getElementById('peso').value = data.peso !== 'N/A' ? data.peso : '';
  document.getElementById('estatura').value = data.estatura !== 'N/A' ? data.estatura : '';
  document.getElementById('division').value = data.division;
  document.getElementById('subdivision').value = data.subdivision !== 'No aplica' ? data.subdivision : '';
  
  document.getElementById('subdivisionContainer').style.display = 
    (data.division === 'Novato' || data.division === 'Avanzado') ? 'block' : 'none';
  
  editMode = true;
  editId = index;
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
  a.download = `competidores_${new Date().toISOString().split('T')[0]}.json`;
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
    "Número": comp.numero,
    "Nombre": comp.nombre,
    "Cédula": comp.cedula,
    "Ciudad": comp.ciudad,
    "Categoría": comp.categoria,
    "Peso (kg)": comp.peso === 'N/A' ? '' : comp.peso,
    "Estatura (m)": comp.estatura === 'N/A' ? '' : comp.estatura,
    "División": comp.division,
    "Subdivisión": comp.subdivision
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Competidores");
  XLSX.writeFile(workbook, `competidores_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          categoria: row["Categoría"] || 'bodybuilding',
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
          subdivision: item.subdivision || 'No aplica'
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
  return Math.floor(Math.random() * 1000) + 1;
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
    const categoriaNormalizada = c.categoria.toLowerCase().replace("men's", 'mens');
    
    return { 
      ...c, 
      division: divisionNormalizada,
      categoria: categoriaNormalizada
    };
  });

  const contenedor = document.getElementById('tablasClasificacion');
  contenedor.innerHTML = '';

  // Estructura completa de categorías en el orden solicitado
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
      nombre: 'WHEELCHAIR',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: [] },
        { nombre: 'Avanzado', subdivisiones: [] },  
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
      nombre: 'MEN\'S PHYSIQUE',
      divisiones: [
        { nombre: 'Prejuvenil', subdivisiones: [] },
        { nombre: 'Juvenil', subdivisiones: [] },
        { nombre: 'Semi-novatos', subdivisiones: [] },
        { nombre: 'Novato', subdivisiones: ['Hasta 1.70m', '1.70-1.75m', '1.75-1.80m', 'Más de 1.80m'] },
        { nombre: 'Avanzado', subdivisiones: ['Hasta 1.70m', '1.70-1.75m', '1.75-1.80m', 'Más de 1.80m'] },
        { nombre: 'Master', subdivisiones: [] }
      ]
    }
  ];

  // Contador para numeración consecutiva
  let contadorTablas = 1;
  let tablasGeneradas = [];

  // Generar tablas para cada categoría
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

  // Ordenar las tablas por número y agregarlas al contenedor
  tablasGeneradas.sort((a, b) => a.numero - b.numero);
  tablasGeneradas.forEach(tabla => {
    contenedor.appendChild(tabla.elemento);
  });

  // Verificar competidores no clasificados
  verificarCompetidoresNoClasificados(competidoresNormalizados);
  document.getElementById('clasificacionFinalContainer').style.display = 'block';
}

function generarTablaClasificacion(competidores, categoria, division, subdivision = '', numeroTabla = 0) {
  const categoriaFormatoDatos = categoria.toLowerCase().replace(/ /g, '_').replace("men's", 'mens');
  
  let filtrados = competidores.filter(comp => {
    // Verificar categoría
    const categoriaMatch = comp.categoria === categoriaFormatoDatos;
    
    // Verificar división (con múltiples variantes)
    const divisionVariantes = [
      division.toLowerCase(),
      division.toLowerCase().replace('-', ' '),
      division.toLowerCase().replace(' ', '-')
    ];
    
    const divisionMatch = divisionVariantes.includes(comp.division.toLowerCase());
    
    // Verificar subdivisión si existe
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
        <script src="https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>
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
            <td>${comp.numero}</td>
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
    alert(`Advertencia: ${noClasificados.length} competidores no fueron clasificados. Verifica la consola para más detalles.`);
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

    // Agregar título de subdivisión con estilo
    hojasPorCategoria[categoria].push([
      {
        v: titulo,
        t: 's',
        s: {
          font: { bold: true, sz: 12 },
          fill: { fgColor: { rgb: "DDDDDD" } }
        }
      }
    ]);

    // Agregar encabezados con estilo
    hojasPorCategoria[categoria].push(
      headers.map(header => ({
        v: header,
        t: 's',
        s: {
          font: { bold: true },
          fill: { fgColor: { rgb: "F0F0F0" } }
        }
      }))
    );

    // Agregar filas de datos
    rows.forEach(row => {
      hojasPorCategoria[categoria].push(
        row.map(cell => ({
          v: cell,
          t: 's'
        }))
      );
    });

    // Agregar una fila vacía como separación
    hojasPorCategoria[categoria].push([]);
  });

  const workbook = XLSX.utils.book_new();

  Object.entries(hojasPorCategoria).forEach(([categoria, contenido]) => {
    const hoja = XLSX.utils.aoa_to_sheet(contenido);

    // Opcional: establecer anchos de columna
    hoja['!cols'] = [
      { wch: 10 }, // Número
      { wch: 30 }, // Nombre
      { wch: 20 }, // Ciudad
      { wch: 10 }  // Puesto
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
      
      // También ocultar la clasificación final si está visible
      document.getElementById('clasificacionFinalContainer').style.display = 'none';
    }
  }
}
window.editCompetidor = editCompetidor;
window.deleteCompetidor = deleteCompetidor;
window.borrarTodosLosCompetidores = borrarTodosLosCompetidores;