/* Calendario Entom - lógica principal (vanilla, sin dependencias)
   Enfoque: compatibilidad Safari iOS / Chrome Android / Desktop.
   Evitamos parseo Date("YYYY-MM-DD") en Safari: usamos piezas y new Date(y, m-1, d).
*/
(() => {
  'use strict';

  const pad2 = (n) => String(n).padStart(2, '0');

  const MONTHS_ES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];

  // Requisito explícito: Lun, Mar, Mie, Jue, Vie, Sab, Dom
  const DOW = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom'];

  const $ = (sel) => document.querySelector(sel);

  const scheduleBody = $('#scheduleBody');
  const calendarGrid = $('#calendarGrid');
  const formMessage = $('#formMessage');

  const outClientHeader = $('#outClientHeader');

  const clientName = $('#clientName');
  const startDate = $('#startDate');
  const startTime = $('#startTime');

  const btnGenerate = $('#btnGenerate');
  const btnUpdate = $('#btnUpdate');
  const btnReset = $('#btnReset');
  const btnPrint = $('#btnPrint');

  const state = {
    client: '',
    anchor: null, // {y,m,d}
    visits: []
  };

  function setMessage(text, type='') {
    formMessage.textContent = text;
    formMessage.className = 'message' + (type ? ` message--${type}` : '');
  }
  function clearInvalid(input) { input.setAttribute('aria-invalid', 'false'); }
  function setInvalid(input) { input.setAttribute('aria-invalid', 'true'); }

  function isoFromParts(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
  function partsFromISO(iso){
    const [y,m,d] = String(iso).split('-').map(Number);
    return {y, m, d};
  }

  function addMonthsSafeParts(anchorParts, monthsToAdd){
    const base = new Date(anchorParts.y, anchorParts.m-1, 1);
    const originalDay = anchorParts.d;
    base.setMonth(base.getMonth() + monthsToAdd);
    const y = base.getFullYear();
    const mIndex = base.getMonth();
    const lastDay = new Date(y, mIndex+1, 0).getDate();
    const d = Math.min(originalDay, lastDay);
    return { y, m: mIndex+1, d };
  }

  function monthLabel(monthIndex0){ return MONTHS_ES[monthIndex0]; }

  function shortDate(iso){
    const p = partsFromISO(iso);
    return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
  }

  function mondayFirstIndex(jsDay){
    // jsDay: 0 Domingo..6 Sábado -> 0 Lunes..6 Domingo
    return (jsDay + 6) % 7;
  }

  // ---------------- Festivos MX ----------------
  // Dos categorías:
  // - off: no laborales (rojo medio)
  // - work: conmemorativos/laborales (otro color)

  function nthWeekdayOfMonth(year, monthIndex0, weekday0Sun, n){
    const first = new Date(year, monthIndex0, 1);
    const offset = (weekday0Sun - first.getDay() + 7) % 7;
    return 1 + offset + (n-1)*7;
  }

  function nthSundayOfMonth(year, monthIndex0, n){
    // Sunday = 0
    return nthWeekdayOfMonth(year, monthIndex0, 0, n);
  }

  function mexicoHolidays(year){
    const off = new Set();
    const work = new Set();

    // --- No laborales (federales típicos) ---
    off.add(isoFromParts(year,1,1));   // Año Nuevo
    off.add(isoFromParts(year,5,1));   // Día del Trabajo
    off.add(isoFromParts(year,9,16));  // Independencia
    off.add(isoFromParts(year,12,25)); // Navidad

    // Constitución: 1er lunes de febrero
    off.add(isoFromParts(year,2,nthWeekdayOfMonth(year,1,1,1)));
    // Benito Juárez: 3er lunes de marzo
    off.add(isoFromParts(year,3,nthWeekdayOfMonth(year,2,1,3)));
    // Revolución: 3er lunes de noviembre
    off.add(isoFromParts(year,11,nthWeekdayOfMonth(year,10,1,3)));

    // --- Laborales / conmemorativos (resaltar distinto) ---
    work.add(isoFromParts(year,2,14)); // 14 Feb San Valentín
    work.add(isoFromParts(year,4,30)); // Día del Niño
    work.add(isoFromParts(year,5,10)); // Día de las Madres
    work.add(isoFromParts(year,6,nthSundayOfMonth(year,5,3))); // Día del Padre: 3er domingo de junio
    work.add(isoFromParts(year,10,31)); // Halloween (cultural)
    work.add(isoFromParts(year,11,2));  // Día de Muertos
    work.add(isoFromParts(year,12,12)); // Virgen de Guadalupe (cultural)

    return {off, work};
  }

  function collectHolidaysForRange(startParts){
    const years = new Set();
    for (let i=0;i<12;i++) years.add(addMonthsSafeParts(startParts, i).y);

    const offAll = new Set();
    const workAll = new Set();
    years.forEach(y => {
      const h = mexicoHolidays(y);
      h.off.forEach(d => offAll.add(d));
      h.work.forEach(d => workAll.add(d));
    });

    return {offAll, workAll};
  }

  // ---------------- Tabla editable ----------------
  function buildScheduleRows(anchorParts, timeStr){
    scheduleBody.innerHTML = '';
    state.visits = [];

    for (let i=0;i<12;i++){
      const p = addMonthsSafeParts(anchorParts, i);
      const iso = isoFromParts(p.y, p.m, p.d);

      const tr = document.createElement('tr');
      tr.dataset.index = String(i);

      const tdMonth = document.createElement('td');
      tdMonth.textContent = `${monthLabel(p.m-1)} ${p.y}`;

      const tdDate = document.createElement('td');
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = iso;
      dateInput.className = 'visit-date';
      dateInput.required = true;
      dateInput.addEventListener('input', () => tr.classList.remove('row-error'));
      tdDate.appendChild(dateInput);

      const tdTime = document.createElement('td');
      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.value = timeStr;
      timeInput.className = 'visit-time';
      timeInput.required = true;
      tdTime.appendChild(timeInput);

      tr.append(tdMonth, tdDate, tdTime);
      scheduleBody.appendChild(tr);

      state.visits.push({ year: p.y, month: p.m-1, isoDate: iso, time: timeStr });
    }
  }

  function readScheduleFromTable(anchorParts){
    const rows = [...scheduleBody.querySelectorAll('tr')];
    const visits = [];
    let hasError = false;

    if (rows.length !== 12) hasError = true;

    rows.forEach((tr, i) => {
      const expected = addMonthsSafeParts(anchorParts, i);
      const expectedYear = expected.y;
      const expectedMonth0 = expected.m - 1;

      const dateInput = tr.querySelector('.visit-date');
      const timeInput = tr.querySelector('.visit-time');

      clearInvalid(dateInput);
      clearInvalid(timeInput);
      tr.classList.remove('row-error');

      if (!dateInput.value){ setInvalid(dateInput); hasError = true; }
      if (!timeInput.value){ setInvalid(timeInput); hasError = true; }

      if (dateInput.value){
        const p = partsFromISO(dateInput.value);
        if (p.y !== expectedYear || (p.m-1) !== expectedMonth0){
          tr.classList.add('row-error');
          setInvalid(dateInput);
          hasError = true;
        }
      }

      visits.push({
        year: expectedYear,
        month: expectedMonth0,
        isoDate: dateInput.value || isoFromParts(expectedYear, expectedMonth0+1, expected.d),
        time: timeInput.value || '00:00'
      });
    });

    return {visits, hasError};
  }

  // ---------------- Render mini-calendario ----------------
  function renderMiniCalendar(year, monthIndex0, visitISO, visitTime, holidays){
    const wrapper = document.createElement('article');
    wrapper.className = 'mini';

    const title = document.createElement('div');
    title.className = 'mini__title';
    title.innerHTML = `<h3>${monthLabel(monthIndex0)}</h3><div class="year">${year}</div>`;

    const week = document.createElement('div');
    week.className = 'week';
    for (const d of DOW){
      const el = document.createElement('div');
      el.className = 'dow';
      el.textContent = d;
      week.appendChild(el);
    }

    const days = document.createElement('div');
    days.className = 'days';

    const first = new Date(year, monthIndex0, 1);
    const lastDay = new Date(year, monthIndex0+1, 0).getDate();
    const startOffset = mondayFirstIndex(first.getDay());

    let visitDay = null;
    if (visitISO){
      const p = partsFromISO(visitISO);
      if (p.y === year && (p.m-1) === monthIndex0) visitDay = p.d;
    }

    for (let i=0;i<startOffset;i++){
      const blank = document.createElement('div');
      blank.className = 'day day--muted';
      blank.textContent = '';
      days.appendChild(blank);
    }

    for (let d=1; d<=lastDay; d++){
      const cell = document.createElement('div');
      const iso = isoFromParts(year, monthIndex0+1, d);

      const isOff = holidays.offAll.has(iso);
      const isWork = holidays.workAll.has(iso);
      const isVisit = (visitDay === d);

      let cls = 'day';
      if (isOff) cls += ' day--holiday-off';
      else if (isWork) cls += ' day--holiday-work';
      if (isVisit) cls += ' day--visit'; // prioridad visual

      cell.className = cls;
      cell.textContent = String(d);
      days.appendChild(cell);
    }

    const totalCells = startOffset + lastDay;
    const remainder = totalCells % 7;
    if (remainder !== 0){
      for (let i=0;i<(7-remainder);i++){
        const blank = document.createElement('div');
        blank.className = 'day day--muted';
        blank.textContent = '';
        days.appendChild(blank);
      }
    }

    const visitText = document.createElement('div');
    visitText.className = 'visit-text';
    if (visitISO && visitTime){
      visitText.innerHTML = `<div><strong>Entom nos visita:</strong> ${shortDate(visitISO)} ${visitTime}</div>`;
    } else {
      visitText.innerHTML = `<div class="muted">Entom nos visita: —</div>`;
    }

    wrapper.append(title, week, days, visitText);
    return wrapper;
  }

  function renderAll(){
    calendarGrid.innerHTML = '';

    const holidays = state.anchor ? collectHolidaysForRange(state.anchor) : {offAll:new Set(), workAll:new Set()};

    for (const v of state.visits){
      calendarGrid.appendChild(renderMiniCalendar(v.year, v.month, v.isoDate, v.time, holidays));
    }

    outClientHeader.textContent = state.client || '—';
  }

  // ---------------- Validación base ----------------
  function validateBaseForm(){
    let ok = true;
    [clientName, startDate, startTime].forEach(clearInvalid);

    const name = (clientName.value || '').trim();
    if (name.length < 2 || name.length > 65){ setInvalid(clientName); ok = false; }
    if (!startDate.value){ setInvalid(startDate); ok = false; }
    if (!startTime.value){ setInvalid(startTime); ok = false; }

    return ok;
  }

  function syncStateFromBase(){
    state.client = (clientName.value || '').trim();
    state.anchor = partsFromISO(startDate.value);
  }

  // ---------------- Acciones ----------------
  btnGenerate.addEventListener('click', () => {
    setMessage('', '');
    if (!validateBaseForm()){
      setMessage('Completa Nombre (2–65), Fecha y Hora para generar.', 'err');
      return;
    }

    syncStateFromBase();
    buildScheduleRows(state.anchor, startTime.value);

    const {visits, hasError} = readScheduleFromTable(state.anchor);
    state.visits = visits;

    renderAll();
    setMessage(hasError
      ? 'Se generó la tabla, pero hay inconsistencias. Corrige filas en rojo y valida.'
      : 'Se generaron 12 visitas. Puedes editar la tabla y luego validar.',
      hasError ? 'err' : 'ok'
    );
  });

  btnUpdate.addEventListener('click', () => {
    setMessage('', '');
    if (!validateBaseForm()){
      setMessage('Faltan datos básicos. Completa el formulario.', 'err');
      return;
    }

    syncStateFromBase();
    if (scheduleBody.children.length !== 12){
      buildScheduleRows(state.anchor, startTime.value);
    }

    const {visits, hasError} = readScheduleFromTable(state.anchor);
    if (hasError){
      setMessage('Hay errores: revisa filas en rojo. No se puede imprimir hasta corregir.', 'err');
      return;
    }

    state.visits = visits;
    renderAll();
    setMessage('Validación OK. Calendario actualizado.', 'ok');
  });

  btnReset.addEventListener('click', () => {
    setMessage('', '');
    scheduleBody.innerHTML = '';
    calendarGrid.innerHTML = '';
    state.client=''; state.anchor=null; state.visits=[];
    outClientHeader.textContent = '—';
    [clientName,startDate,startTime].forEach(clearInvalid);
  });

  btnPrint.addEventListener('click', () => {
    // Validación obligatoria antes de imprimir
    if (!state.visits.length){
      setMessage('Primero genera y valida el calendario antes de imprimir.', 'err');
      return;
    }
    if (!validateBaseForm() || !state.anchor){
      setMessage('Completa el formulario y valida antes de imprimir.', 'err');
      return;
    }
    const {hasError} = readScheduleFromTable(state.anchor);
    if (hasError){
      setMessage('No se puede imprimir: hay errores en la tabla (filas en rojo o campos vacíos).', 'err');
      return;
    }
    window.print();
  });

  // Defaults
  (function seedDefaults(){
    const now = new Date();
    startDate.value = isoFromParts(now.getFullYear(), now.getMonth()+1, now.getDate());
    startTime.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  })();

})();
