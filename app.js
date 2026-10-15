import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const $ = s => document.querySelector(s);
const el = id => $('#l-' + id);
const esc = s => (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">посилання</a>');
const mins = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const fmtDur = n => ((n >= 60 ? Math.floor(n / 60) + ' год ' : '') + (n % 60 ? (n % 60) + ' хв' : '')).trim() || '0 хв';
const nameOf = id => profiles.find(p => p.id === id)?.name;
const role = r => (r === 'teacher' ? 'Вчитель' : 'Учень');

let sid, schedule, profiles = [], lessons = [], me = null, editId = null;

async function load() {
  const [s, p, l] = await Promise.all([
    sb.from('schedules').select('*').eq('id', sid).single(),
    sb.from('profiles').select('*').eq('schedule_id', sid).order('created_at'),
    sb.from('lessons').select('*').eq('schedule_id', sid),
  ]);
  const err = s.error || p.error || l.error;
  if (err) throw err;
  schedule = s.data; profiles = p.data; lessons = l.data;
  if (me) me = profiles.find(x => x.id === me.id) || null;
}
const refresh = async () => { try { await load(); render(); } catch (e) { console.error(e); } };

async function init() {
  try {
    sid = new URLSearchParams(location.search).get('s');
    if (!sid) {
      const { data, error } = await sb.from('schedules').insert({}).select().single();
      if (error) throw error;
      sid = data.id;
      history.replaceState(null, '', '?s=' + sid);
    }
    await load();
    const saved = localStorage.getItem('me:' + sid);
    me = profiles.find(x => x.id === saved) || null;
    render();
    sb.channel('s-' + sid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    if (!me) openProfile();
  } catch (e) {
    $('#week').innerHTML = `<p class="err">Помилка: ${esc(e.message)}. Перевірте config.js і SQL у Supabase.</p>`;
  }
}

function card(l) {
  const mine = me && (l.teacher_id === me.id || l.student_id === me.id);
  const t = nameOf(l.teacher_id), s = nameOf(l.student_id);
  return `<article class="lesson${mine ? ' mine' : ''}" data-id="${l.id}" tabindex="0">
    <div class="time">${l.start_time.slice(0, 5)}–${l.end_time.slice(0, 5)}<span>${fmtDur(l.duration_min)}</span></div>
    <strong>${esc(l.title)}</strong>
    ${t ? `<div class="who t">Вчитель: ${esc(t)}</div>` : ''}${s ? `<div class="who s">Учень: ${esc(s)}</div>` : ''}
    ${l.note ? `<p class="note">${linkify(l.note)}</p>` : ''}</article>`;
}

function render() {
  if (document.activeElement !== $('#title')) $('#title').value = schedule.title;
  document.title = schedule.title;
  $('#who').innerHTML = '<option value="">Оберіть профіль…</option>' +
    profiles.map(p => `<option value="${p.id}">${role(p.role)}: ${esc(p.name)}</option>`).join('') +
    '<option value="__new">+ Новий профіль</option>';
  $('#who').value = me?.id ?? '';
  const today = (new Date().getDay() + 6) % 7 + 1;
  $('#week').innerHTML = DAYS.map((name, i) => {
    const d = i + 1;
    const items = lessons.filter(l => l.day === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    return `<section class="day${d === today ? ' today' : ''}"><h2>${name}</h2>
      ${items.map(card).join('') || '<p class="empty">Уроків немає</p>'}
      <button class="add" data-day="${d}">+ Додати урок</button></section>`;
  }).join('');
}

/* ---------- урок ---------- */
const syncEnd = () => {
  const s = mins(el('start').value || '00:00');
  let d = Math.max(5, +el('dur').value || 0);
  if (s + d > 1439) d = Math.max(0, 1439 - s);
  el('dur').value = d; el('end').value = hhmm(s + d);
};
const syncDur = () => {
  const d = mins(el('end').value || '00:00') - mins(el('start').value || '00:00');
  d > 0 ? (el('dur').value = d) : syncEnd();
};
el('start').addEventListener('input', syncEnd);
el('dur').addEventListener('input', syncEnd);
el('end').addEventListener('input', syncDur);
el('day').innerHTML = DAYS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');

function openLesson(id, day) {
  editId = id;
  const l = id ? lessons.find(x => x.id === id) : {
    day, title: '', start_time: '16:00', duration_min: 60, note: '',
    teacher_id: me?.role === 'teacher' ? me.id : '', student_id: me?.role === 'student' ? me.id : '',
  };
  const opts = r => '<option value="">—</option>' + profiles.filter(p => p.role === r).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  el('teacher').innerHTML = opts('teacher'); el('student').innerHTML = opts('student');
  el('title').value = l.title; el('day').value = l.day;
  el('start').value = l.start_time.slice(0, 5); el('dur').value = l.duration_min; syncEnd();
  el('note').value = l.note ?? '';
  el('teacher').value = l.teacher_id ?? ''; el('student').value = l.student_id ?? '';
  $('#lessonHead').textContent = id ? 'Редагувати урок' : 'Новий урок';
  $('#l-del').hidden = !id;
  $('#lessonDlg').showModal();
}

$('#lessonForm').addEventListener('submit', async e => {
  e.preventDefault();
  const row = {
    schedule_id: sid, day: +el('day').value, title: el('title').value.trim(),
    start_time: el('start').value, end_time: el('end').value, duration_min: +el('dur').value,
    note: el('note').value.trim() || null,
    teacher_id: el('teacher').value || null, student_id: el('student').value || null,
    updated_at: new Date().toISOString(),
  };
  if (row.duration_min <= 0) return alert('Завершення має бути пізніше за початок.');
  const { error } = await (editId ? sb.from('lessons').update(row).eq('id', editId) : sb.from('lessons').insert(row));
  if (error) return alert(error.message);
  $('#lessonDlg').close(); refresh();
});
$('#l-cancel').onclick = () => $('#lessonDlg').close();
$('#l-del').onclick = async () => {
  if (!confirm('Видалити урок для всіх?')) return;
  const { error } = await sb.from('lessons').delete().eq('id', editId);
  if (error) return alert(error.message);
  $('#lessonDlg').close(); refresh();
};

$('#week').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const add = e.target.closest('.add'), les = e.target.closest('.lesson');
  if (add) openLesson(null, +add.dataset.day);
  else if (les) openLesson(les.dataset.id);
});
$('#week').addEventListener('keydown', e => {
  const les = e.target.closest?.('.lesson');
  if (les && e.key === 'Enter') openLesson(les.dataset.id);
});

/* ---------- профілі ---------- */
const openProfile = () => { $('#p-name').value = ''; $('#profileDlg').showModal(); };
$('#p-cancel').onclick = () => $('#profileDlg').close();
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { data, error } = await sb.from('profiles').insert({
    schedule_id: sid, name: $('#p-name').value.trim(),
    role: document.querySelector('input[name=role]:checked').value,
  }).select().single();
  if (error) return alert(error.message);
  me = data; localStorage.setItem('me:' + sid, data.id);
  $('#profileDlg').close(); refresh();
});
$('#who').onchange = e => {
  const v = e.target.value;
  if (v === '__new') { e.target.value = me?.id ?? ''; return openProfile(); }
  me = profiles.find(p => p.id === v) || null;
  me ? localStorage.setItem('me:' + sid, me.id) : localStorage.removeItem('me:' + sid);
  render();
};

/* ---------- статистика ---------- */
function openStats() {
  if (!me) return openProfile();
  const mine = lessons.filter(l => l.teacher_id === me.id || l.student_id === me.id);
  const total = mine.reduce((a, l) => a + l.duration_min, 0);
  const perDay = DAYS.map((_, i) => mine.filter(l => l.day === i + 1).reduce((a, l) => a + l.duration_min, 0));
  const max = Math.max(...perDay, 1);
  const partners = new Set(mine.map(l => (me.role === 'teacher' ? l.student_id : l.teacher_id)).filter(Boolean));
  const now = new Date();
  const cur = ((now.getDay() + 6) % 7) * 1440 + now.getHours() * 60 + now.getMinutes();
  const next = mine.map(l => { let at = (l.day - 1) * 1440 + mins(l.start_time); if (at < cur) at += 10080; return { l, at }; })
    .sort((a, b) => a.at - b.at)[0]?.l;
  $('#statsBody').innerHTML = `
    <h3>${esc(me.name)}<span class="badge ${me.role}">${role(me.role)}</span></h3>
    <div class="tiles">
      <div class="tile"><b>${mine.length}</b><span>уроків на тиждень</span></div>
      <div class="tile"><b>${fmtDur(total)}</b><span>разом за тиждень</span></div>
      <div class="tile"><b>${mine.length ? fmtDur(Math.round(total / mine.length)) : '—'}</b><span>середня тривалість</span></div>
      <div class="tile"><b>${partners.size}</b><span>${me.role === 'teacher' ? 'учнів' : 'вчителів'}</span></div>
      <div class="tile" style="grid-column:1/-1"><b>${next ? `${DAYS[next.day - 1]}, ${next.start_time.slice(0, 5)}` : '—'}</b><span>${next ? 'найближчий: ' + esc(next.title) : 'найближчий урок'}</span></div>
    </div>
    ${perDay.map((v, i) => `<div class="bar-row"><span>${SHORT[i]}</span><i style="width:${v / max * 100}%"></i><b>${v ? fmtDur(v) : ''}</b></div>`).join('')}
    <p class="empty">Усього в розкладі: ${lessons.length} уроків, ${profiles.length} профілів.</p>`;
  $('#statsDlg').showModal();
}
$('#stats').onclick = openStats;
$('#s-close').onclick = () => $('#statsDlg').close();

/* ---------- шапка ---------- */
$('#title').addEventListener('change', async e => {
  const title = e.target.value.trim() || 'Розклад уроків';
  const { error } = await sb.from('schedules').update({ title }).eq('id', sid);
  if (error) alert(error.message);
});
$('#share').onclick = async e => {
  await navigator.clipboard.writeText(location.href);
  e.target.textContent = 'Скопійовано';
  setTimeout(() => (e.target.textContent = 'Скопіювати посилання'), 1600);
};

init();
