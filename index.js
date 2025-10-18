let editMode = false;
let editRowIndex = null;

document.getElementById('categoria').addEventListener('change', function() {
    const categoria = this.value;
    const pesoContainer = document.getElementById('pesoContainer');
    const estaturaContainer = document.getElementById('estaturaContainer');

    pesoContainer.style.display = 'none';
    estaturaContainer.style.display = 'none';

    if (categoria === 'bodybuilding') {
        pesoContainer.style.display = 'block';
    } else if (categoria === 'classic_physique') {
        pesoContainer.style.display = 'block';
        estaturaContainer.style.display = 'block';
    } else if (categoria === 'mens_physique') {
        estaturaContainer.style.display = 'block';
    }
});

document.getElementById('competidorForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value;
    const cedula = document.getElementById('cedula').value;
    const telefono = document.getElementById('telefono').value;
    const direccion = document.getElementById('direccion').value;
    const categoria = document.getElementById('categoria').value;
    const peso = document.getElementById('peso').value || 'N/A';
    const estatura = document.getElementById('estatura').value || 'N/A';

    let division = '';

    // Clasificación según la categoría Classic Physique
    if (categoria === 'classic_physique') {
        const altura = parseInt(estatura);
        const pesoValue = parseInt(peso);

        if (altura <= 170) {
            if (altura <= 163 && pesoValue <= 73) division = 'Clase A';
            else if (altura <= 165 && pesoValue <= 75) division = 'Clase A';
            else if (altura <= 168 && pesoValue <= 77) division = 'Clase A';
            else if (altura <= 170 && pesoValue <= 79) division = 'Clase A';
        } else if (altura <= 178) {
            if (altura <= 173 && pesoValue <= 83) division = 'Clase B';
            else if (altura <= 175 && pesoValue <= 86) division = 'Clase B';
            else if (altura <= 178 && pesoValue <= 89) division = 'Clase B';
        } else if (altura <= 183) {
            if (altura <= 180 && pesoValue <= 93) division = 'Clase C';
            else if (altura <= 183 && pesoValue <= 96) division = 'Clase C';
        } else {
            if (altura <= 185 && pesoValue <= 100) division = 'Clase D';
            else if (altura <= 188 && pesoValue <= 104) division = 'Clase D';
            else if (altura <= 191 && pesoValue <= 108) division = 'Clase D';
            else if (altura <= 193 && pesoValue <= 111) division = 'Clase D';
            else if (altura <= 196 && pesoValue <= 114) division = 'Clase D';
            else if (altura <= 198 && pesoValue <= 118) division = 'Clase D';
            else if (altura <= 201 && pesoValue <= 121) division = 'Clase D';
            else if (altura > 201 && pesoValue <= 125) division = 'Clase D';
        }
    }

    const competidorData = {
        nombre,
        cedula,
        telefono,
        direccion,
        categoria,
        peso,
        estatura,
        division
    };

    if (editMode) {
        updateRow(editRowIndex, competidorData);
    } else {
        addRow(competidorData);
    }

    resetForm();
});

function addRow(competidorData) {
    const tableBody = document.querySelector('#competidorTable tbody');
    const row = document.createElement('tr');

    row.innerHTML = `
        <td>${competidorData.nombre}</td>
        <td>${competidorData.cedula}</td>
        <td>${competidorData.telefono}</td>
        <td>${competidorData.direccion}</td>
        <td>${competidorData.categoria}</td>
        <td>${competidorData.peso}</td>
        <td>${competidorData.estatura}</td>
        <td>${competidorData.division}</td>
        <td class="actions">
            <button onclick="editRow(this)">Editar</button>
            <button onclick="deleteRow(this)">Borrar</button>
        </td>
    `;

    tableBody.appendChild(row);
}

function updateRow(index, competidorData) {
    const row = document.querySelector(`#competidorTable tbody`).rows[index];
    
    row.cells[0].innerText = competidorData.nombre;
    row.cells[1].innerText = competidorData.cedula;
    row.cells[2].innerText = competidorData.telefono;
    row.cells[3].innerText = competidorData.direccion;
    row.cells[4].innerText = competidorData.categoria;
    row.cells[5].innerText = competidorData.peso;
    row.cells[6].innerText = competidorData.estatura;
    row.cells[7].innerText = competidorData.division;
}

function editRow(button) {
    editMode = true;
    editRowIndex = button.parentElement.parentElement.rowIndex - 1;

    const row = button.parentElement.parentElement;
    
    document.getElementById('nombre').value = row.cells[0].innerText;
    document.getElementById('cedula').value = row.cells[1].innerText;
    document.getElementById('telefono').value = row.cells[2].innerText;
    document.getElementById('direccion').value = row.cells[3].innerText;
    document.getElementById('categoria').value = row.cells[4].innerText.toLowerCase().replace(' ', '_');

    if (row.cells[4].innerText === 'bodybuilding' || row.cells[4].innerText === 'classic_physique') {
        document.getElementById('peso').value = row.cells[5].innerText;
    }

    if (row.cells[4].innerText ===
