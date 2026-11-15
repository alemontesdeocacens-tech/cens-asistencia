/* ════════════════════════════════════════════════════════════════
   Bruno — asistente de CENS Digital (sin IA)
   Responde con los datos que la app ya tiene cargados en memoria:
   datos (usuarios, cursos, alumnos), allRegistros y currentUser.
   Nada sale de la app: no hay llamadas a servicios externos de IA.

   Se carga con:  <script src="bruno.js"></script>   (antes de </body>)
   Imágenes en:   bruno/avatar.webp, feliz.webp, pensando.webp, sorpresa.webp,
                  ok.webp, nose.webp, festejo.webp
   ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CFG = { imgs: 'bruno/', umbralRiesgo: 75, maxLista: 8 };
  var rolForzado = null;                       // solo para pruebas

  /* ───────────────────────── Texto ───────────────────────── */
  function sinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function norm(s) {
    return sinTildes(s).toLowerCase().replace(/[°º]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function titulo(s) {
    return String(s || '').replace(/\s*,\s*/g, ' ').toLowerCase().replace(/(^|[\s\-'])([a-záéíóúüñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Una sola edición (cambio, alta, baja o intercambio de dos letras): tolera errores de tipeo
  function lev1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    if (la > lb) return a.slice(i + 1) === b.slice(i);
    return b.slice(i + 1) === a.slice(i);
  }
  function puntosTok(q, n) {
    if (q === n) return 3;
    if (q.length >= 3 && n.indexOf(q) === 0) return 2;
    if (q.length >= 5 && lev1(q, n)) return 1;
    return 0;
  }

  var STOP = {};
  ('es son esta estan alumno alumna alumnos alumnas estudiante estudiantes de del la el los las un una unos unas que en curso cursa ' +
   'figura anotado anotada inscripto inscripta busca buscar buscame decime dime quiero saber si por favor hay tiene tienen ' +
   'cuantas cuantos cuantas faltas falta falto faltaron faltan inasistencias inasistencia ausencias ausencia ausente ausentes hoy ' +
   'a al me mi mis con y o para como cual cuales quien quienes dato datos info informacion sobre le lo se su sus preceptor preceptora ' +
   'turno legajo dni asistencia porcentaje cuanto veces ver mostrame muestrame dame pasame ese esa este esta tal es era fue ' +
   'estudia tiene tenes tengo mas menos ya no vino vinieron tarde noche año ano anio ver existe registrado registrada encontra ' +
   'cursando pertenece algun alguna llamado llamada llama apellido nombre nombres listame listado lista que tal gracias hola buenas buenos dias tardes noches').split(' ')
    .forEach(function (w) { STOP[w] = 1; });

  /* ───────────────────────── Datos de la app ───────────────────────── */
  function D() { return (typeof datos !== 'undefined' && datos) ? datos : { usuarios: [], cursos: [], alumnos: [] }; }
  function REG() { return (typeof allRegistros !== 'undefined' && allRegistros) ? allRegistros : []; }
  function USR() { return (typeof currentUser !== 'undefined') ? currentUser : null; }
  function activo(a) { return a.activo === 'SI' || a.activo === true; }
  function hoyApp() { return new Date().toISOString().split('T')[0]; }   // misma convención que la app

  function visible(id) {
    if (typeof document === 'undefined') return false;
    var el = document.getElementById(id);
    return !!el && el.style.display !== 'none' && global.getComputedStyle(el).display !== 'none';
  }
  function rol() {
    if (rolForzado) return rolForzado;
    if (typeof document !== 'undefined' && document.getElementById('screen-app')) {
      if (visible('view-profesor')) return 'profesor';
      if (visible('view-preceptor')) return 'preceptor';
      if (visible('view-directora')) return 'directora';
    }
    var u = USR();
    if (u && u.rol) {
      var r = String(u.rol).toLowerCase();
      if (r === 'directora') return 'directora';
      if (r.indexOf('preceptor') === 0) return 'preceptor';
    }
    return null;
  }
  function nombreUsuario() { var u = USR(); return (u && u.nombre) ? u.nombre : ''; }

  function cursosVisibles() {
    var cs = D().cursos || [];
    if (rol() === 'preceptor') return cs.filter(function (c) { return c.preceptor === nombreUsuario(); });
    return cs;
  }
  function esMiCurso(idCurso) {
    if (rol() !== 'preceptor') return true;
    return cursosVisibles().some(function (c) { return c.id === idCurso; });
  }
  function cursoPorId(id) { return (D().cursos || []).filter(function (c) { return c.id === id; })[0]; }

  /* ───────────────────────── Cursos y nombres ───────────────────────── */
  function indiceCursos() {
    var m = {};
    (D().cursos || []).forEach(function (c) { m[norm(c.nombre).replace(/\s/g, '')] = c; });
    return m;
  }
  // Reconoce "2b", "2°B", "2 b", "2do B", "segundo b", "tercer año c"…
  function parseCurso(t) {
    var idx = indiceCursos();
    var s = ' ' + t + ' ';
    s = s.replace(/\b(primer|primero|primera)\b/g, '1').replace(/\b(segundo|segunda)\b/g, '2').replace(/\b(tercer|tercero|tercera)\b/g, '3');
    var re = /\b(\d)\s*(?:ro|do|er|to|ero|mo|vo|no)?\s*(?:ano|anio|curso)?\s*([a-z])\b/g, m;
    while ((m = re.exec(s))) {
      var c = idx[m[1] + m[2]];
      if (c) return { curso: c, resto: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
    }
    return { curso: null, resto: t };
  }
  function tokensNombre(t) {
    return t.split(' ').filter(function (w) { return w.length >= 2 && !STOP[w] && /[a-z]/.test(w); });
  }
  function buscarAlumnos(tokens, idCurso) {
    if (!tokens.length) return [];
    var out = [];
    (D().alumnos || []).forEach(function (a) {
      if (idCurso && a.idCurso !== idCurso) return;
      var nt = norm(a.nombre).split(' '), usados = {}, score = 0, ok = true;
      for (var k = 0; k < tokens.length; k++) {
        var best = 0, bi = -1;
        for (var i = 0; i < nt.length; i++) {
          if (usados[i]) continue;
          var p = puntosTok(tokens[k], nt[i]);
          if (p > best) { best = p; bi = i; }
        }
        if (!best) { ok = false; break; }
        usados[bi] = 1; score += best;
      }
      if (ok) out.push({ a: a, s: score * 10 - nt.length + (activo(a) ? 5 : 0) });
    });
    return out.sort(function (x, y) { return y.s - x.s; }).map(function (x) { return x.a; });
  }

  /* ───────────────────────── Asistencia ───────────────────────── */
  function regsDeCurso(idCurso) { return REG().filter(function (r) { return r.idCurso === idCurso; }); }
  function regHoy(idCurso) { var h = hoyApp(); return REG().filter(function (r) { return r.idCurso === idCurso && r.fecha === h; })[0]; }
  function normN(n) { return norm(String(n).replace(/,/g, ' ')); }
  // Misma regla que la app (calcularStatsAlumno): lo que no es presente/tardanza/RA cuenta como ausencia
  function statsAlumno(nombre, regs) {
    var p = 0, aus = 0, t = 0, ra = 0, nn = normN(nombre), ult = [];
    regs.forEach(function (r) {
      var e = r.data[nombre];
      if (e === undefined) { var k = Object.keys(r.data).filter(function (x) { return normN(x) === nn; })[0]; if (k) e = r.data[k]; }
      if (e === 'Presente') p++;
      else if (e === 'Tardanza') t++;
      else if (e && e.indexOf('RA') === 0) ra++;
      else { aus++; ult.push(r.fecha); }
    });
    ult.sort().reverse();
    var dias = regs.length;
    return { p: p, aus: aus, t: t, ra: ra, dias: dias, pct: dias ? Math.round(p / dias * 100) : null, ult: ult.slice(0, 3) };
  }
  function ddmm(f) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(f || ''); return m ? m[3] + '/' + m[2] : f; }
  function lista(arr, max) {
    max = max || CFG.maxLista;
    return arr.length > max ? arr.slice(0, max).join(', ') + ' y ' + (arr.length - max) + ' más' : arr.join(', ');
  }

  /* ───────────────────────── Respuestas ───────────────────────── */
  function R(t, face, chips, extra) { var o = { t: t, face: face || 'feliz', chips: chips || [] }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function chipsBase() {
    var r = rol();
    if (r === 'preceptor') return [
      { l: '¿Ya tomé lista hoy?', q: 'ya tomé lista hoy' }, { l: '¿Quién faltó hoy?', q: 'quién faltó hoy' },
      { l: 'Más inasistencias', q: 'más inasistencias' }, { l: 'Buscar un alumno', q: 'buscar un alumno' },
      { l: 'Cómo justifico una falta', q: 'cómo justifico una falta' }, { l: 'Cumpleaños', q: 'cumpleaños de la semana' }];
    if (r === 'directora') return [
      { l: 'Resumen de hoy', q: 'resumen de hoy' }, { l: 'Cursos sin lista', q: 'qué cursos no tomaron lista' },
      { l: 'Más inasistencias', q: 'más inasistencias' }, { l: 'Buscar un alumno', q: 'buscar un alumno' },
      { l: 'Cumpleaños', q: 'cumpleaños de la semana' }, { l: 'Qué podés hacer', q: 'qué podés hacer' }];
    return [
      { l: 'Buscar un alumno', q: 'buscar un alumno' }, { l: '¿Quién faltó hoy en…?', q: 'quién faltó hoy' },
      { l: 'Cómo veo la asistencia', q: 'cómo veo la asistencia de un curso' }, { l: 'Qué podés hacer', q: 'qué podés hacer' }];
  }
  function saludoHora() { var h = new Date().getHours(); return h < 12 ? 'Buen día' : (h < 20 ? 'Buenas tardes' : 'Buenas noches'); }

  function bienvenida() {
    var r = rol(), n = nombreUsuario();
    var quien = r === 'profesor' ? '' : (n ? ', ' + n : '');
    var t = saludoHora() + quien + '. Soy **Bruno**, el asistente de CENS Digital. ' +
      'Puedo buscar alumnos, contarte la asistencia de hoy y explicarte cómo se hace cada cosa en la app. ¿Qué necesitás?';
    return R(t, 'feliz', chipsBase());
  }
  function ayuda() {
    var r = rol(), l = ['Esto es lo que puedo hacer:'];
    l.push('• **Buscar alumnos**: curso, turno, preceptor/a y si está activo. Escribí el nombre, por ejemplo "García Juan".');
    l.push('• **Datos de cursos**: preceptor/a, turno y cantidad de estudiantes.');
    if (r !== 'profesor') {
      l.push('• **Asistencia de hoy**: quién faltó y qué cursos todavía no tienen lista.');
      l.push('• **Inasistencias**: quiénes faltaron más y cómo viene un alumno.');
      l.push('• **Cumpleaños** de la semana.');
    } else {
      l.push('• **Asistencia de un curso**: escribí el curso, por ejemplo "quién faltó hoy en 2°B".');
    }
    l.push('• **Guías paso a paso** de la app: "cómo justifico una falta", "cómo doy de baja", etc.');
    return R(l.join('\n'), 'ok', chipsBase());
  }

  function fichaAlumno(a) {
    var c = cursoPorId(a.idCurso) || { nombre: a.curso, preceptor: '—', turno: '—' };
    var l = ['**' + titulo(a.nombre) + '**'];
    l.push('• Curso: **' + (a.curso || c.nombre) + '**' + (c.turno ? ' · turno ' + c.turno : ''));
    l.push('• Preceptor/a: ' + (c.preceptor || '—'));
    l.push('• Estado: ' + (activo(a) ? 'activo/a' : 'dado/a de baja'));
    if (rol() === 'directora' && a.dni) l.push('• DNI: ' + String(a.dni).replace(/\.0+$/, ''));
    var chips = [];
    if (esMiCurso(a.idCurso)) chips.push({ l: 'Ver sus faltas', q: '@f:' + a.id });
    return R(l.join('\n'), 'ok', chips);
  }
  function opcionesAlumnos(lista_, prefijo) {
    var max = 8, chips = lista_.slice(0, max).map(function (a) {
      return { l: titulo(a.nombre) + ' (' + a.curso + (activo(a) ? '' : ', baja') + ')', q: prefijo + a.id };
    });
    var t = 'Encontré **' + lista_.length + '** coincidencias' + (lista_.length > max ? ' (te muestro las primeras ' + max + '; escribí el apellido y el nombre para afinar)' : '') + '. ¿Cuál es?';
    return R(t, 'pensando', chips);
  }
  function respFaltas(a) {
    if (!esMiCurso(a.idCurso))
      return R('**' + titulo(a.nombre) + '** no es de tus cursos, así que no puedo mostrarte su asistencia. Si la necesitás, consultalo con Dirección.', 'nose', []);
    var regs = regsDeCurso(a.idCurso);
    if (!regs.length) return R('Todavía no hay listas cargadas para **' + a.curso + '**, así que no tengo asistencia para mostrarte.', 'nose', []);
    var s = statsAlumno(a.nombre, regs), l = ['**' + titulo(a.nombre) + '** · ' + a.curso];
    l.push('• Días con lista: ' + s.dias);
    l.push('• Presente: ' + s.p + ' · Ausente: ' + s.aus + ' · Tardanza: ' + s.t + ' · Retiro anticipado: ' + s.ra);
    l.push('• Asistencia: **' + s.pct + '%**' + (s.pct < CFG.umbralRiesgo ? ' (por debajo del ' + CFG.umbralRiesgo + '%)' : ''));
    if (s.ult.length) l.push('• Últimas ausencias: ' + s.ult.map(ddmm).join(', '));
    l.push('Los números incluyen las faltas justificadas.');
    return R(l.join('\n'), s.pct < CFG.umbralRiesgo ? 'pensando' : 'ok', []);
  }

  function respCurso(c) {
    var al = (D().alumnos || []).filter(function (a) { return a.idCurso === c.id; });
    var act = al.filter(activo).length, bajas = al.length - act;
    var l = ['**' + c.nombre + '**'];
    l.push('• Preceptor/a: ' + c.preceptor);
    l.push('• Turno: ' + c.turno);
    l.push('• Estudiantes activos: ' + act + (bajas ? ' (' + bajas + ' de baja)' : ''));
    var chips = [];
    if (rol() !== 'profesor' || true) chips.push({ l: 'Quién faltó hoy en ' + c.nombre, q: 'quién faltó hoy en ' + c.nombre });
    return R(l.join('\n'), 'ok', chips);
  }

  function respListaHoy() {
    var r = rol();
    if (r === 'profesor') return R('Las listas de cada curso las ves en **Historial por día**: elegís el curso y la fecha.', 'ok', [{ l: 'Abrir Historial', tab: 'historial' }]);
    var cs = cursosVisibles(), con = [], sin = [];
    cs.forEach(function (c) { (regHoy(c.id) ? con : sin).push(c); });
    if (!cs.length) return R('No tengo cursos asignados a tu usuario.', 'nose', []);
    var l = [];
    if (r === 'preceptor') {
      if (!sin.length) l.push('Sí, ya cargaste la lista de **todos tus cursos** de hoy (' + con.length + ').');
      else if (!con.length) l.push('Todavía no cargaste ninguna lista hoy. Te faltan: ' + sin.map(function (c) { return c.nombre; }).join(', ') + '.');
      else l.push('Ya cargaste: ' + con.map(function (c) { return c.nombre; }).join(', ') + '.\nTe faltan: ' + sin.map(function (c) { return c.nombre; }).join(', ') + '.');
      return R(l.join('\n'), sin.length ? 'pensando' : 'ok', sin.length ? [{ l: 'Abrir Tomar lista', tab: 'lista' }] : []);
    }
    l.push('Hoy hay lista en **' + con.length + ' de ' + cs.length + '** cursos.');
    if (sin.length) {
      var por = {};
      sin.forEach(function (c) { (por[c.preceptor] = por[c.preceptor] || []).push(c.nombre); });
      l.push('Sin lista (' + sin.length + '):');
      Object.keys(por).forEach(function (p) { l.push('• ' + p + ': ' + por[p].join(', ')); });
    }
    return R(l.join('\n'), sin.length ? 'pensando' : 'festejo', [{ l: 'Resumen de hoy', q: 'resumen de hoy' }]);
  }

  function respAusentesHoy(t) {
    var r = rol(), pc = parseCurso(t), cs;
    if (pc.curso) {
      if (!esMiCurso(pc.curso.id)) return R('**' + pc.curso.nombre + '** no es de tus cursos. Para ese curso consultá con Dirección.', 'nose', []);
      cs = [pc.curso];
    } else if (r === 'profesor') {
      return R('¿De qué curso? Escribilo así: "quién faltó hoy en 2°B".', 'pensando', []);
    } else cs = cursosVisibles();
    var l = [], totalAus = 0, sinLista = 0, hay = 0, recortado = false;
    cs.forEach(function (c) {
      var reg = regHoy(c.id);
      if (!reg) { sinLista++; return; }
      hay++;
      var aus = Object.keys(reg.data).filter(function (n) { return reg.data[n] === 'Ausente'; }).map(titulo);
      totalAus += aus.length; if (aus.length > CFG.maxLista) recortado = true;
      if (aus.length) l.push('**' + c.nombre + '** (' + aus.length + '): ' + lista(aus));
      else if (cs.length === 1) l.push('**' + c.nombre + '**: no hubo ausentes.');
    });
    if (!hay) return R(cs.length === 1 ? 'En **' + cs[0].nombre + '** todavía no hay lista cargada hoy.' : 'Todavía no hay ninguna lista cargada hoy.', 'nose', []);
    if (!totalAus && cs.length > 1) l.push('Hoy no hay ausentes en las listas cargadas.');
    if (cs.length > 1) l.unshift('Ausentes de hoy: **' + totalAus + '** en ' + hay + ' curso' + (hay === 1 ? '' : 's') + ' con lista.');
    if (recortado && cs.length > 1) l.push('Para ver todos los nombres de un curso, escribí por ejemplo «quién faltó hoy en ' + cs[0].nombre + '».');
    if (sinLista && cs.length > 1) l.push('(' + sinLista + ' curso' + (sinLista === 1 ? '' : 's') + ' sin lista todavía)');
    return R(l.join('\n'), totalAus ? 'ok' : 'festejo', []);
  }

  function respResumen() {
    var cs = cursosVisibles(), P = 0, A = 0, T = 0, RA = 0, tot = 0, con = 0;
    cs.forEach(function (c) {
      var reg = regHoy(c.id); if (!reg) return;
      var v = Object.keys(reg.data).map(function (k) { return reg.data[k]; });
      P += v.filter(function (x) { return x === 'Presente'; }).length;
      A += v.filter(function (x) { return x === 'Ausente'; }).length;
      T += v.filter(function (x) { return x === 'Tardanza'; }).length;
      RA += v.filter(function (x) { return x.indexOf('RA') === 0; }).length;
      tot += v.length; con++;
    });
    if (!con) return R('Hoy todavía no hay ninguna lista cargada.', 'nose', [{ l: 'Cursos sin lista', q: 'qué cursos no tomaron lista' }]);
    var l = ['**Resumen de hoy**', '• Listas cargadas: ' + con + ' de ' + cs.length + ' cursos',
      '• Presentes: ' + P + ' · Ausentes: ' + A + ' · Tardanzas: ' + T + ' · Retiros anticipados: ' + RA,
      '• Asistencia: **' + (tot ? Math.round(P / tot * 100) : 0) + '%**'];
    return R(l.join('\n'), 'ok', [{ l: 'Cursos sin lista', q: 'qué cursos no tomaron lista' }, { l: '¿Quién faltó hoy?', q: 'quién faltó hoy' }]);
  }

  function respMasFaltas(t) {
    var pc = parseCurso(t), cs = pc.curso ? [pc.curso] : cursosVisibles();
    if (pc.curso && !esMiCurso(pc.curso.id)) return R('**' + pc.curso.nombre + '** no es de tus cursos.', 'nose', []);
    var filas = [];
    cs.forEach(function (c) {
      var regs = regsDeCurso(c.id); if (regs.length < 3) return;
      (D().alumnos || []).filter(function (a) { return a.idCurso === c.id && activo(a); }).forEach(function (a) {
        var s = statsAlumno(a.nombre, regs); filas.push({ a: a, s: s });
      });
    });
    if (!filas.length) return R('Todavía no hay suficientes listas cargadas para comparar.', 'nose', []);
    filas.sort(function (x, y) { return y.s.aus - x.s.aus; });
    var top = filas.slice(0, 5);
    var l = ['**Quiénes más faltaron**' + (pc.curso ? ' en ' + pc.curso.nombre : '') + ' (incluye faltas justificadas):'];
    top.forEach(function (f, i) { l.push((i + 1) + '. ' + titulo(f.a.nombre) + ' (' + f.a.curso + '): ' + f.s.aus + ' de ' + f.s.dias + ' días'); });
    var todas = filas.filter(function (f) { return f.s.dias >= 10 && f.s.aus === f.s.dias; }).length;
    if (todas) l.push('Ojo: **' + todas + '** estudiante' + (todas === 1 ? '' : 's') + ' figura' + (todas === 1 ? '' : 'n') + ' con ausencia en todos los días con lista cargada.');
    return R(l.join('\n'), 'ok', [{ l: 'Ver % por curso', tab: 'asistencia-curso' }]);
  }

  function respCumples() {
    var r = rol();
    if (r === 'profesor') return R('Los cumpleaños los ven Dirección y Preceptoría, porque dependen de los cursos a cargo.', 'nose', []);
    var ids = {}; cursosVisibles().forEach(function (c) { ids[c.id] = 1; });
    var now = new Date(), h0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), out = [];
    (D().alumnos || []).forEach(function (a) {
      if (!activo(a) || !ids[a.idCurso]) return;
      var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(a.fechaNacimiento || '').trim()); if (!m) return;
      var f = new Date(h0.getFullYear(), +m[2] - 1, +m[3]);
      if (f < h0) f = new Date(h0.getFullYear() + 1, +m[2] - 1, +m[3]);
      var dias = Math.round((f - h0) / 86400000);
      if (dias <= 7) out.push({ a: a, dias: dias, f: f });
    });
    out.sort(function (x, y) { return x.dias - y.dias; });
    if (!out.length) return R('Esta semana no hay cumpleaños entre ' + (r === 'preceptor' ? 'tus estudiantes' : 'los estudiantes') + '.', 'ok', []);
    var dsem = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    var l = ['**Cumpleaños de la semana**'];
    out.slice(0, 15).forEach(function (x) {
      var cuando = x.dias === 0 ? '🎂 Hoy' : (x.dias === 1 ? 'Mañana' : dsem[x.f.getDay()] + ' ' + x.f.getDate() + '/' + (x.f.getMonth() + 1));
      l.push('• ' + cuando + ': ' + titulo(x.a.nombre) + ' (' + x.a.curso + ')');
    });
    if (out.length > 15) l.push('y ' + (out.length - 15) + ' más.');
    return R(l.join('\n'), out[0].dias === 0 ? 'festejo' : 'ok', []);
  }

  /* ───────────────────────── Guías paso a paso ───────────────────────── */
  var G = [
    { id: 'lista', kw: /(tom|pas|carg|guard|envi|registr|hag|mand)\w*( la| una)? lista|(marc|registr|carg|pas)\w*( la)? asistencia/,
      roles: { preceptor: ['lista', '**Tomar lista**\n1. Entrá a **📋 Tomar lista**.\n2. Elegí el **curso** y la **fecha**.\n3. Marcá a cada estudiante (presente, ausente, tardanza o retiro anticipado). Arriba ves los contadores.\n4. Tocá **💾 Guardar y enviar lista**.\nSi la querés en papel, usá **📄 Descargar PDF de la lista**.'] } },
    { id: 'justificar', kw: /justific/,
      roles: {
        preceptor: ['justificaciones', '**Justificar una falta**\n1. Entrá a **📝 Justificaciones**.\n2. Elegí el **curso** y el **alumno**.\n3. Buscá la falta y cargá el motivo. Se pueden justificar inasistencias de hasta 60 días atrás.'],
        directora: ['justificaciones', 'Las justificaciones las cargan los preceptores. Vos podés consultarlas en **📝 Justificaciones**.'],
        profesor: ['justificaciones', 'Las justificaciones las cargan los preceptores. Vos podés consultarlas en **📝 Justificaciones**.'] } },
    { id: 'nuevo', kw: /nuev[oa] alumn|alta de alumn|de alta (a )?(un )?(alumn|estudiante)|dar de alta|doy de alta|(agreg|sum|anot|inscrib|cre|carg)\w*( a)?( un| una)? (nuev[oa] )?(alumn|estudiante)/,
      roles: { preceptor: ['nuevo-alumno', '**Agregar un alumno**\n1. Entrá a **➕ Nuevo alumno**.\n2. Completá **Apellido y Nombre**, **Curso**, **DNI** (sin puntos), **Sexo**, fecha de ingreso y fecha de nacimiento.\n3. Tocá **➕ Agregar alumno**. Ya aparece en las listas del curso.'] } },
    { id: 'cambio', kw: /cambi\w* (de )?curso|(mov|cambi|pas)\w*( a)?( un| una)? (alumn|estudiante).*curso|mover (a )?(un )?(alumn|estudiante)/,
      roles: { preceptor: ['gestionar-alumnos', '**Cambiar de curso a un alumno**\n1. Entrá a **⚙️ Gestionar** y elegí **🔄 Cambio de curso**.\n2. Elegí el **curso actual**, el **alumno** y el curso al que se **mueve**.\n3. Tocá **🔄 Confirmar cambio de curso**.'] } },
    { id: 'baja', kw: /\bbaja\b|de baja|(elimin|borr|sac)\w*( a)?( un| una)? (alumn|estudiante)/,
      roles: { preceptor: ['gestionar-alumnos', '**Dar de baja a un alumno**\n1. Entrá a **⚙️ Gestionar** y elegí **🗑 Dar de baja**.\n2. Elegí **curso**, **alumno** y el **motivo de baja**.\n3. Tocá **🗑 Confirmar baja**. El alumno queda inactivo y sus registros de asistencia se conservan.'] } },
    { id: 'editar', kw: /editar (los )?datos|corregir (los )?datos|cambiar (el )?(dni|nombre)/,
      roles: { preceptor: ['gestionar-alumnos', 'Para corregir datos de un alumno entrá a **⚙️ Gestionar** y elegí **✏️ Editar datos**.'] } },
    { id: 'informe', kw: /informe|boletin|reporte|pdf del alumn/,
      roles: {
        preceptor: ['informe', '**Informe por alumno**\n1. Entrá a **📄 Informe**.\n2. Elegí **curso**, **alumno** y **período**.\n3. Tocá **📄 Generar informe PDF**.\nPara un rango de días usá **📅 Por fechas**.'],
        directora: ['informe', '**Informe por alumno**\n1. Entrá a **📄 Informe**.\n2. Elegí curso, alumno y período.\n3. Generá el PDF. Para un rango de días usá **📅 Por fechas**.'],
        profesor: ['cuatrimestral', '**Informes**\n• **📄 Cuatrimestral**: elegí curso, cuatrimestre y alumno, y generá el PDF.\n• **📅 Anual**: asistencia completa del año.\n• **🔍 Por fechas**: un rango de días.'] } },
    { id: 'porcentaje', kw: /porcentaje|% curso|asistencia (del|por) curso|ver la asistencia|ver asistencia|asistencia de un curso/,
      roles: {
        preceptor: ['asistencia-curso', '**% de asistencia por curso**\nEntrá a **📈 % Curso**, elegí **curso** y **período**. Ves la tabla acumulada de todos los alumnos y podés bajarla en **📄 PDF** o **📊 Excel**.'],
        directora: ['asistencia-curso', '**% de asistencia por curso**\nEntrá a **📈 % Curso**, elegí curso y período. Ves la tabla acumulada y podés bajarla en PDF o Excel.'],
        profesor: ['historial', '**Asistencia de un curso**\n• **📋 Historial**: elegí curso y fecha para ver ese día.\n• **📊 Resumen curso**: totales por alumno en un período, con PDF.'] } },
    { id: 'fechas', kw: /por fechas|rango de fechas|entre fechas|desde .* hasta/,
      roles: {
        preceptor: ['fechas', '**Informe por fechas**\nEntrá a **📅 Por fechas**, elegí **curso**, **alumno** y el rango **Desde / Hasta**, y generá el PDF.'],
        directora: ['fechas', '**Informe por fechas**\nEntrá a **📅 Por fechas**, elegí curso, alumno y el rango Desde / Hasta, y generá el PDF.'],
        profesor: ['fechas', '**Informe por fechas**\nEntrá a **🔍 Por fechas**, elegí curso, alumno y el rango Desde / Hasta, y generá el PDF.'] } },
    { id: 'progresar', kw: /progres\w+/,
      roles: {
        preceptor: ['progresar', '**Plan Progresar**\n1. Entrá a **🎓 Progresar** y elegí el **curso**.\n2. Tildá a los alumnos anotados (**✓ Todos** / **✗ Ninguno** ayudan).\n3. Tocá **💾 Guardar y exportar PDF**.'],
        directora: ['progresar', 'En **🎓 Progresar** ves los alumnos anotados en el plan por curso. Para bajar todo junto usá **📥 Exportar**.'] } },
    { id: 'salida', kw: /salida|excursion|paseo|visita educativa/,
      roles: { preceptor: ['salida', '**Salida educativa**\n1. Entrá a **🚌 Salida** y escribí el **destino** y la **fecha**.\n2. Elegí el **curso** y tildá a quienes confirman.\n3. Tocá **📄 Generar listado PDF**.'] } },
    { id: 'documentos', kw: /documento|material|curricular|subir (un )?(archivo|documento)/,
      roles: {
        preceptor: ['documentos', 'En **📚 Documentos** están los materiales institucionales que comparte Dirección. Con **🔄 Actualizar** traés los últimos.'],
        profesor: ['documentos', 'En **📚 Documentos** están los materiales que comparte Dirección. Con **🔄 Actualizar** traés los últimos.'],
        directora: ['docs', '**Subir un documento**\n1. Entrá a **📚 Documentos**.\n2. Elegí el **archivo** y la **categoría**.\n3. Tocá **📤 Subir documento**. Los profesores y preceptores lo ven al instante.'] } },
    { id: 'legajo', kw: /legajo|formulario|condicion especial/,
      roles: {
        preceptor: ['legajo-preceptor', '**Legajo del alumno**\n1. Entrá a **🗂️ Legajo**, elegí **curso** y **alumno**.\n2. Podés copiar el **link del formulario de Google** para que el alumno complete sus datos.\n3. También podés cargar **notas internas** (solo las ve el equipo) y marcar una condición especial.'],
        directora: ['legajos', '**Legajos**\nEn **🗂️ Legajos** ves cuántos están completos, incompletos o sin legajo, y buscás por apellido o nombre. También podés sacar el **informe de condición especial** en PDF o Excel.'] } },
    { id: 'historial', kw: /historial|listas guardadas/,
      roles: {
        preceptor: ['historial', 'En **📊 Historial** ves las listas que guardaste vos, con presentes, ausentes y porcentaje.'],
        profesor: ['historial', '**Historial por día**\nEntrá a **📋 Historial**, elegí el **curso** y la **fecha** para ver la asistencia de ese día.'] } },
    { id: 'rite', kw: /\brite\b|trayectoria|calificacion|notas del alumn/,
      roles: { preceptor: ['rite', 'El botón **📋 RITE** abre el sistema de trayectorias y calificaciones. Por ahora Bruno no consulta datos de ahí.'] } },
    { id: 'matricula', kw: /matricula/,
      roles: { directora: ['matricula', '**Matrícula**\nEn **👥 Matrícula** ves los alumnos activos por sexo, **por curso** o **por sede**. Con **🔍 Buscar** encontrás a alguien por nombre o DNI, y podés bajar el PDF.'] } },
    { id: 'exportar', kw: /export\w+|excel|descargar (todo|los datos)/,
      roles: { directora: ['exportar', '**Exportar**\nEn **📥 Exportar** bajás Excel de: salidas educativas, plan Progresar, asistencia completa del año (una hoja por curso) y matrícula por sexo.'] } },
    { id: 'config', kw: /configuracion|config\b|usuarios?\b|contrasena|clave|nuevo usuario|nuevo curso|agregar curso|crear curso|cambiar (la )?(contrasena|clave)/,
      roles: { directora: ['configuracion', '**Configuración**\nEn **⚙️ Config** administrás **usuarios** (nuevo usuario, activar o desactivar, cambiar contraseña con **🔑 Cambiar**) y **cursos** (nuevo curso, editar nombre, preceptor y turno).'] } },
    { id: 'migrar', kw: /migr\w+|ciclo lectivo|\bciclo\b|pasar de ano|promocion/,
      roles: {
        directora: ['migrar', '**Migrar ciclo lectivo**\n1. Entrá a **🎓 Migrar ciclo** y elegí el **curso de origen** y el **destino**.\n2. Tocá **🔍 Ver alumnos** y marcá a los que **pasan de año**.\n3. Confirmá. Ojo: los que no marcás quedan **dados de baja**.'],
        preceptor: ['gestionar-alumnos', 'El pase de año está en **⚙️ Gestionar → 🎓 Migrar ciclo**. Ojo: los alumnos que no marcás quedan dados de baja.'] } }
  ];
  function guiaPara(t, r) {
    for (var i = 0; i < G.length; i++) if (G[i].kw.test(t)) return G[i];
    return null;
  }
  function respGuia(g, r) {
    var d = g.roles[r];
    if (!d) {
      var quien = g.roles.directora ? 'Dirección' : (g.roles.preceptor ? 'Preceptoría' : 'otro perfil');
      return R('Eso se gestiona desde el perfil de **' + quien + '**. Si lo necesitás, pedíselo a quien corresponda.', 'nose', []);
    }
    var chips = d[0] ? [{ l: 'Abrir esa pestaña', tab: d[0] }] : [];
    if (d[0] === 'rite') chips = [{ l: 'Abrir RITE', rite: true }];
    return R(d[1], 'ok', chips);
  }

  /* ───────────────────────── Interpretación ───────────────────────── */
  var RX = {
    saludo: /^(hola|holis|holi|buen|buenas|buenos|que tal|hey|ey)\b/,
    gracias: /\b(gracias|genial|perfecto|buenisimo|excelente|de diez|joya|barbaro)\b/,
    chau: /\b(chau|adios|hasta luego|hasta manana|nos vemos|me voy)\b/,
    quien: /(quien sos|quien eres|como te llamas|cual es tu nombre|que sos|que haces|que podes hacer|que sabes|para que servis|en que me podes ayudar|en que me ayudas|ayuda\b|ayudame|opciones|\bmenu\b|que puedo preguntar|que te puedo preguntar)/,
    cumples: /(cumple|cumpleanos|cumplen anos|festej)/,
    listaHoy: /(ya (tome|pase|cargue|hice|guarde|envie)|tome lista|tomaron lista|tomamos lista|falta(n)? (tomar|pasar|cargar)? ?(la )?lista|sin lista|no tomaron|pendiente.*lista|lista.*pendiente|lista de hoy|cursos? (sin|con) lista|quien(es)? (no )?(tomo|tomaron|cargo|cargaron)|cargaron la lista|tengo lista)/,
    ausentesHoy: /(falto|faltaron|faltan|falta|ausente|ausentes|ausencia|ausencias|inasistencia|inasistencias|no vino|no vinieron|no vienen).*\bhoy\b|\bhoy\b.*(falto|faltaron|ausente|ausentes|inasistencia|no vino|no vinieron)|quien(es)? (falto|faltaron|falta)\b|hay ausentes/,
    masFaltas: /(mas|mayor|mayores|muchas|muchos|top|ranking|peor|peores).*(falta|faltas|faltan|faltaron|inasistencia|inasistencias|ausencia|ausencias|ausentismo)|(falta|faltan|faltaron) (mas|mucho)|en riesgo|ausentismo (alto|critico)|menos asistencia|menor asistencia/,
    resumen: /(resumen|panorama|como estamos|como vamos|como viene (el dia|hoy)|estado (general|del dia)|ausentismo (de hoy|general)|asistencia de hoy|asistencia general|como esta la asistencia)/,
    faltasKw: /(falta|faltas|falto|faltaron|inasistencia|inasistencias|ausencia|ausencias|ausente|asistencia|presentismo|porcentaje|cuantas veces)/,
    preceptor: /(preceptor|preceptora|a cargo|quien tiene|quien esta (con|a cargo)|quien lleva)/,
    turno: /\bturno\b/,
    cantidad: /(cuantos|cuantas|cantidad|total de).*(alumnos|alumnas|estudiantes|chicos|matricula|inscriptos|anotados|hay)|(alumnos|estudiantes) (hay|tiene|tienen)/,
    buscar: /(es alumn|es estudiante|alumno|alumna|figura|esta anotad|esta inscript|esta en|en que curso|que curso|de que curso|cursa|buscar|busca|buscame|encontra|datos de|info de|informacion de|quien es|existe|esta registrad)/,
    misCursos: /(mis cursos|que cursos tengo|cursos a mi cargo|cuales son mis cursos|mi curso)/,
    como: /\b(como|donde|en donde|de que forma|pasos|paso a paso|se puede|puedo|quiero|necesito|tengo que|hay que|explicame|explicar|ensename|indicame|que hago)\b/,
    pedirNombre: /^(buscar|busca|buscame|encontrar)( un| una)?( alumn[oa]| estudiante)?$/
  };

  function desconocida() {
    return R('No te entendí del todo. Probá con alguna de estas, o escribime el nombre de un alumno o un curso:', 'nose', chipsBase(), { desconocida: true });
  }

  function responder(texto) {
    texto = String(texto == null ? '' : texto).slice(0, 200).trim();
    var r = rol();
    if (!r) return R('Para ayudarte necesito que ingreses primero a la app.', 'nose', []);
    if (!texto) return ayuda();

    // Selecciones de los botones: @a:ID (ficha) y @f:ID (faltas)
    var sel = /^@([af]):(.+)$/.exec(texto);
    if (sel) {
      var al = (D().alumnos || []).filter(function (a) { return String(a.id) === sel[2]; })[0];
      if (!al) return desconocida();
      return sel[1] === 'a' ? fichaAlumno(al) : respFaltas(al);
    }

    texto = texto.replace(/^\s*bruno\s*[,:]\s*/i, '') || texto;      // "Bruno, quién faltó hoy"
    var t = norm(texto), nTok = t.split(' ').length;
    if (RX.saludo.test(t) && nTok <= 4) return R(pick(['¡Hola! ¿En qué te ayudo?', '¡Hola! Contame qué necesitás.', 'Hola, acá estoy. ¿Qué necesitás?']), 'feliz', chipsBase());
    if (RX.gracias.test(t) && nTok <= 6) return R(pick(['¡De nada! Para eso estoy.', 'Un gusto ayudarte.', '¡Cuando quieras!']), 'ok', []);
    if (RX.chau.test(t) && nTok <= 6) return R('¡Chau! Que tengas una buena jornada.', 'feliz', []);
    if (RX.quien.test(t)) return ayuda();
    if (RX.pedirNombre.test(t)) return R('Escribime el apellido y el nombre, por ejemplo **García Juan**. Si no sabés cómo se escribe, con el apellido alcanza.', 'pensando', []);

    // "¿Cómo hago…?" + tema conocido → guía paso a paso
    var g = guiaPara(t);
    if (g && RX.como.test(t)) return respGuia(g, r);

    if (RX.cumples.test(t)) return respCumples();
    if (RX.listaHoy.test(t)) return respListaHoy();
    if (RX.masFaltas.test(t)) return respMasFaltas(t);
    if (RX.ausentesHoy.test(t)) return respAusentesHoy(t);
    if (RX.resumen.test(t)) return r === 'profesor'
      ? R('El resumen de un curso lo ves en **📊 Resumen curso**.', 'ok', [{ l: 'Abrir Resumen curso', tab: 'resumen' }]) : respResumen();

    // Cursos y nombres
    var pc = parseCurso(t), tokens = tokensNombre(pc.resto);
    var matches = tokens.length ? buscarAlumnos(tokens, pc.curso ? pc.curso.id : null) : [];

    if (RX.faltasKw.test(t) && matches.length) return matches.length === 1 ? respFaltas(matches[0]) : opcionesAlumnos(matches, '@f:');
    if (RX.misCursos.test(t)) {
      if (r !== 'preceptor') return R('Ves **todos los cursos**. Decime cuál te interesa, por ejemplo "2°B".', 'ok', []);
      var mc = cursosVisibles();
      return R(mc.length ? 'Tenés a cargo **' + mc.length + '** cursos: ' + mc.map(function (c) { return c.nombre; }).join(', ') + '.' : 'No tengo cursos asignados a tu usuario.', mc.length ? 'ok' : 'nose', []);
    }
    if (RX.preceptor.test(t)) {
      if (matches.length === 1) return fichaAlumno(matches[0]);
      if (pc.curso) return R('El/la preceptor/a de **' + pc.curso.nombre + '** es **' + pc.curso.preceptor + '** (turno ' + pc.curso.turno + ').', 'ok', []);
      if (matches.length > 1) return opcionesAlumnos(matches, '@a:');
      return R('¿De qué curso o alumno? Escribilo así: "preceptor de 2°B".', 'pensando', []);
    }
    if (RX.cantidad.test(t)) {
      if (pc.curso) return respCurso(pc.curso);
      var cs = cursosVisibles(), ids = {}; cs.forEach(function (c) { ids[c.id] = 1; });
      var n = (D().alumnos || []).filter(function (a) { return ids[a.idCurso] && activo(a); }).length;
      return R(r === 'preceptor' ? 'En tus **' + cs.length + '** cursos hay **' + n + '** estudiantes activos.' : 'En total hay **' + n + '** estudiantes activos en **' + cs.length + '** cursos.', 'ok', []);
    }
    if (RX.turno.test(t) && pc.curso) return R('**' + pc.curso.nombre + '** cursa en turno **' + pc.curso.turno + '**.', 'ok', []);

    if (matches.length && (RX.buscar.test(t) || tokens.length >= 1)) {
      if (matches.length === 1) return fichaAlumno(matches[0]);
      return opcionesAlumnos(matches, '@a:');
    }
    if (pc.curso && !matches.length && /(ausente|ausentes|falto|faltaron|faltan|inasistencia|inasistencias)/.test(t)) return respAusentesHoy(t);
    if (pc.curso && !tokens.length) return respCurso(pc.curso);

    if (!matches.length && tokens.length >= 2 && tokens.length <= 4 && !RX.como.test(t)) {
      var porLargo = tokens.filter(function (w) { return w.length >= 4; }).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < porLargo.length; i++) {
        var parcial = buscarAlumnos([porLargo[i]], pc.curso ? pc.curso.id : null);
        if (parcial.length && parcial.length <= 8) {
          var o = opcionesAlumnos(parcial, '@a:');
          o.t = 'No encontré a **' + titulo(tokens.join(' ')) + '**. Con **' + titulo(porLargo[i]) + '** hay ' + parcial.length + ' estudiante' + (parcial.length === 1 ? '' : 's') + '. ¿Es alguno de estos?';
          return o;
        }
      }
    }
    if (g) return respGuia(g, r);                    // tema sin "cómo": igual mostramos la guía
    if (tokens.length && tokens.length <= 4 && !RX.como.test(t)) return R('No encontré a nadie que coincida con **' + titulo(tokens.join(' ')) + '**. Probá con el apellido o revisá cómo se escribe.', 'nose', []);
    return desconocida();
  }

  /* ───────────────────────── Interfaz ───────────────────────── */
  var UI = { fab: null, panel: null, msgs: null, input: null, cara: null, teaser: null, firma: null, abierto: false, saludado: false, escribiendo: null };
  var CARAS = { avatar: 'avatar', feliz: 'feliz', pensando: 'pensando', sorpresa: 'sorpresa', ok: 'ok', nose: 'nose', festejo: 'festejo' };

  function src(cara) { return CFG.imgs + (CARAS[cara] || 'feliz') + '.webp'; }

  var CSS = [
    '#bruno-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));width:64px;height:64px;border-radius:50%;border:3px solid var(--white,#fff);background:var(--white,#fff);padding:0;cursor:pointer;z-index:250;overflow:hidden;display:none;box-shadow:0 6px 20px rgba(60,40,10,.28);transition:transform .15s ease}',
    '#bruno-fab:hover{transform:scale(1.06)}',
    '#bruno-fab img,#bruno-cara{display:block;width:100%;height:100%;object-fit:cover}',
    '#bruno-teaser{position:fixed;right:90px;bottom:calc(28px + env(safe-area-inset-bottom,0px));max-width:220px;background:var(--white,#fff);color:var(--text,#2b2118);border:1px solid var(--border,#e7d5c0);border-radius:14px 14px 4px 14px;padding:9px 13px;font-size:14px;line-height:1.35;z-index:250;display:none;box-shadow:0 6px 18px rgba(60,40,10,.18)}',
    '#bruno-panel{position:fixed;right:16px;bottom:calc(92px + env(safe-area-inset-bottom,0px));width:380px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 130px);height:min(580px,calc(100dvh - 130px));display:none;flex-direction:column;background:var(--bg,#fdf6ed);border:1px solid var(--border,#e7d5c0);border-radius:18px;box-shadow:0 14px 44px rgba(60,40,10,.32);z-index:260;overflow:hidden;font-family:inherit}',
    '#bruno-panel.abierto{display:flex}',
    '.bruno-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--blue-dark,#1a6b2a);color:#fff}',
    '.bruno-head .cara{width:46px;height:46px;border-radius:50%;overflow:hidden;background:#fff;flex:none;border:2px solid rgba(255,255,255,.85)}',
    '.bruno-head .quien{flex:1;min-width:0}',
    '.bruno-head .quien b{display:block;font-size:17px;font-weight:700;line-height:1.1}',
    '.bruno-head .quien span{font-size:12.5px;opacity:.88}',
    '.bruno-head button{background:transparent;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:8px}',
    '.bruno-head button:hover{background:rgba(255,255,255,.18)}',
    '#bruno-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:9px;-webkit-overflow-scrolling:touch}',
    '.bruno-m{max-width:86%;padding:9px 13px;border-radius:15px;font-size:15px;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere}',
    '.bruno-m.b{align-self:flex-start;background:var(--white,#fff);color:var(--text,#2b2118);border:1px solid var(--border,#e7d5c0);border-bottom-left-radius:4px}',
    '.bruno-m.u{align-self:flex-end;background:var(--blue,#2d9e44);color:#fff;border-bottom-right-radius:4px}',
    '.bruno-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
    '.bruno-chips button{font:inherit;font-size:13.5px;padding:7px 12px;border-radius:999px;border:1.5px solid var(--blue,#2d9e44);background:var(--white,#fff);color:var(--blue-dark,#1a6b2a);cursor:pointer;text-align:left}',
    '.bruno-chips button:hover{background:var(--green-light,#dcfce7)}',
    '.bruno-typing{display:flex;gap:4px;padding:12px 14px}',
    '.bruno-typing i{width:7px;height:7px;border-radius:50%;background:var(--gray,#78716c);opacity:.5;animation:brunoDot 1s infinite ease-in-out}',
    '.bruno-typing i:nth-child(2){animation-delay:.15s}.bruno-typing i:nth-child(3){animation-delay:.3s}',
    '@keyframes brunoDot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}',
    '.bruno-in{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,#e7d5c0);background:var(--white,#fff)}',
    '.bruno-in input{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px 14px;border:1.5px solid var(--border,#e7d5c0);border-radius:999px;background:var(--bg,#fdf6ed);color:var(--text,#2b2118);outline:none}',
    '.bruno-in input:focus{border-color:var(--blue,#2d9e44)}',
    '.bruno-in button{font:inherit;font-weight:700;padding:0 18px;border:0;border-radius:999px;background:var(--blue,#2d9e44);color:#fff;cursor:pointer}',
    '#bruno-fab:focus-visible,.bruno-head button:focus-visible,.bruno-chips button:focus-visible,.bruno-in button:focus-visible,.bruno-in input:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}',
    '@media (max-width:600px){#bruno-panel{right:0;left:0;top:0;bottom:0;width:100%;max-width:none;height:100vh;height:100dvh;max-height:none;border-radius:0;border:0}.bruno-head{padding-top:calc(12px + env(safe-area-inset-top,0px))}#bruno-teaser{right:86px}}',
    '@media (prefers-reduced-motion:reduce){#bruno-fab,.bruno-typing i{transition:none;animation:none}}'
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function montar() {
    if (UI.fab || typeof document === 'undefined' || !document.body) return;
    var st = el('style'); st.id = 'bruno-css'; st.textContent = CSS; document.head.appendChild(st);

    UI.fab = el('button'); UI.fab.id = 'bruno-fab'; UI.fab.type = 'button'; UI.fab.setAttribute('aria-label', 'Abrir el asistente Bruno');
    UI.fab.innerHTML = '<img alt="" src="' + src('avatar') + '">';
    UI.fab.onclick = function () { UI.abierto ? cerrar() : abrir(); };

    UI.teaser = el('div'); UI.teaser.id = 'bruno-teaser'; UI.teaser.textContent = '¡Hola! Soy Bruno. ¿Te ayudo con algo?';

    UI.panel = el('div'); UI.panel.id = 'bruno-panel'; UI.panel.setAttribute('role', 'dialog'); UI.panel.setAttribute('aria-label', 'Bruno, asistente de CENS Digital');
    var head = el('div', 'bruno-head');
    var cara = el('div', 'cara'); UI.cara = el('img'); UI.cara.id = 'bruno-cara'; UI.cara.alt = ''; UI.cara.src = src('avatar'); cara.appendChild(UI.cara);
    var quien = el('div', 'quien', '<b>Bruno</b><span>Asistente de CENS Digital</span>');
    var x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar'); x.onclick = cerrar;
    head.appendChild(cara); head.appendChild(quien); head.appendChild(x);

    UI.msgs = el('div'); UI.msgs.id = 'bruno-msgs'; UI.msgs.setAttribute('aria-live', 'polite');
    var inp = el('div', 'bruno-in');
    UI.input = el('input'); UI.input.type = 'text'; UI.input.maxLength = 200; UI.input.placeholder = 'Escribí tu pregunta…'; UI.input.autocomplete = 'off';
    UI.input.setAttribute('aria-label', 'Tu pregunta para Bruno');
    var env = el('button', null, 'Enviar'); env.type = 'button';
    function mandar() { var v = UI.input.value.trim(); if (!v) return; UI.input.value = ''; enviar(v); }
    env.onclick = mandar; UI.input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); mandar(); } };
    inp.appendChild(UI.input); inp.appendChild(env);

    UI.panel.appendChild(head); UI.panel.appendChild(UI.msgs); UI.panel.appendChild(inp);
    document.body.appendChild(UI.fab); document.body.appendChild(UI.teaser); document.body.appendChild(UI.panel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && UI.abierto) cerrar(); });
  }

  function setCara(c) { if (UI.cara) UI.cara.src = src(c); }
  function abajo() { UI.msgs.scrollTop = UI.msgs.scrollHeight; }
  function quitarChips() { var c = UI.msgs.querySelectorAll('.bruno-chips'); for (var i = 0; i < c.length; i++) c[i].parentNode.removeChild(c[i]); }

  function agregarUsuario(txt) { quitarChips(); var m = el('div', 'bruno-m u'); m.textContent = txt; UI.msgs.appendChild(m); abajo(); }
  function agregarBruno(resp) {
    quitarChips();
    var m = el('div', 'bruno-m b', fmt(resp.t)); UI.msgs.appendChild(m);
    if (resp.chips && resp.chips.length) {
      var box = el('div', 'bruno-chips');
      resp.chips.forEach(function (c) {
        var b = el('button', null, esc(c.l)); b.type = 'button';
        b.onclick = function () { accionChip(c); };
        box.appendChild(b);
      });
      UI.msgs.appendChild(box);
    }
    setCara(resp.face || 'feliz'); abajo();
  }
  function escribiendo(on) {
    if (on) {
      setCara('pensando');
      UI.escribiendo = el('div', 'bruno-m b bruno-typing', '<i></i><i></i><i></i>'); UI.msgs.appendChild(UI.escribiendo); abajo();
    } else if (UI.escribiendo) { UI.escribiendo.parentNode && UI.escribiendo.parentNode.removeChild(UI.escribiendo); UI.escribiendo = null; }
  }

  function abrirTab(tab) {
    var r = rol(), fn = r === 'preceptor' ? 'pTab' : (r === 'directora' ? 'dTab' : 'profTab');
    var b = document.querySelector('button[onclick^="' + fn + "('" + tab + "'" + '"]');
    if (b) { b.click(); return true; }
    return false;
  }
  function accionChip(c) {
    if (c.q) return enviar(c.q, c.l);
    if (c.rite) { if (typeof abrirRite === 'function') { cerrar(); abrirRite(); } return; }
    if (c.tab) {
      var ok = abrirTab(c.tab);
      if (ok) { cerrar(); if (typeof showToast === 'function') showToast('Listo, abrí «' + c.l.replace(/^Abrir /, '') + '»'); }
      else agregarBruno(R('No pude abrir esa pestaña desde acá. La encontrás en el menú de arriba.', 'nose', []));
    }
  }

  function registrarPregunta(texto) {
    try {
      if (typeof SCRIPT_URL === 'undefined' || typeof fetch !== 'function') return;
      fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ action: 'logPregunta', token: (typeof sesionToken !== 'undefined' ? sesionToken : null), rol: rol(), texto: texto })
      }).catch(function () {});
    } catch (e) { /* el registro es opcional */ }
  }

  function enviar(texto, etiqueta) {
    agregarUsuario(etiqueta || texto);
    escribiendo(true);
    setTimeout(function () {
      escribiendo(false);
      var resp;
      try { resp = responder(texto); }
      catch (e) { resp = R('Se me trabó algo y no pude resolverlo. Probá de nuevo o usá el menú de la app.', 'sorpresa', chipsBase()); if (global.console) console.error('Bruno:', e); }
      agregarBruno(resp);
      if (resp.desconocida) registrarPregunta(texto);
    }, 350 + Math.random() * 250);
  }

  function abrir() {
    if (!UI.panel) return;
    UI.abierto = true; UI.panel.classList.add('abierto'); UI.teaser.style.display = 'none';
    if (!UI.saludado) { UI.saludado = true; agregarBruno(bienvenida()); }
    if (global.matchMedia && !global.matchMedia('(max-width:600px)').matches) UI.input.focus();
  }
  function cerrar() { if (!UI.panel) return; UI.abierto = false; UI.panel.classList.remove('abierto'); setCara('avatar'); }

  function reiniciar() {
    UI.msgs.innerHTML = ''; UI.saludado = false; cerrar();
    UI.teaser.style.display = 'block';
    setTimeout(function () { if (!UI.abierto) UI.teaser.style.display = 'none'; }, 6000);
  }

  // Muestra u oculta a Bruno según haya o no una sesión abierta en la app
  function sincronizar() {
    var activa = visible('screen-app'), r = activa ? rol() : null;
    if (!r) { UI.fab.style.display = 'none'; UI.teaser.style.display = 'none'; if (UI.abierto) cerrar(); UI.firma = null; return; }
    var firma = r + '|' + nombreUsuario();
    if (firma !== UI.firma) { UI.firma = firma; reiniciar(); }
    UI.fab.style.display = 'block';
  }

  function iniciar() {
    if (typeof document === 'undefined') return;
    montar();
    setInterval(sincronizar, 1000);
    sincronizar();
  }

  global.Bruno = {
    responder: responder, bienvenida: bienvenida, iniciar: iniciar, config: CFG,
    _t: { STOP: STOP, fmt: fmt, esc: esc, norm: norm, parseCurso: parseCurso, tokensNombre: tokensNombre, buscarAlumnos: buscarAlumnos, statsAlumno: statsAlumno, forzarRol: function (r) { rolForzado = r; } }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  }
})(typeof window !== 'undefined' ? window : globalThis);
