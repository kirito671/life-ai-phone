const STORE_KEY = 'life-ai-store-v1';
const CONFIG_KEY = 'life-ai-config-v1';
const DEFAULT_CONFIG = {
  name: '孙学',
  targets: { protein_g: 140, calories_deficit_kcal: 600, sleep_hours: 7.5, training_days_per_week: 3, deep_work_hours: 4 },
  ai: { mode: 'manual', base_url: '', model: '', api_key_env: 'LIFE_AI_API_KEY' }
};

const state = { date: todayStr(), config: null, entries: [], activeRecordType: 'food', promptPayload: null, deferredPrompt: null };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const viewMeta = {
  dashboard: '今日概览',
  record: '快速记录',
  report: 'AI 日报',
  settings: '目标设置'
};

const recordConfig = {
  food: {
    title: '记录吃饭', hint: '记录每一餐，自动汇总热量和蛋白质。', listTitle: '今日吃饭记录', listHint: '最近记录会显示在这里。', icon: '🍽️',
    fields: [
      { name: 'time', label: '时间', type: 'time', required: true },
      { name: 'meal', label: '餐次', type: 'select', options: ['早餐', '午餐', '晚餐', '加餐'], required: true },
      { name: 'items', label: '吃了什么', type: 'text', placeholder: '例如：鸡胸肉 + 米饭 + 蔬菜', required: true, span: 2 },
      { name: 'kcal', label: '热量 kcal', type: 'number', min: 0, step: 1, placeholder: '500' },
      { name: 'protein_g', label: '蛋白质 g', type: 'number', min: 0, step: 1, placeholder: '35' },
      { name: 'note', label: '备注', type: 'text', placeholder: '可选', span: 2 }
    ]
  },
  training: {
    title: '记录训练', hint: '记录动作、组数、次数、重量和 RPE。', listTitle: '今日训练记录', listHint: '训练容量会自动估算。', icon: '🏋️',
    fields: [
      { name: 'time', label: '时间', type: 'time', required: true },
      { name: 'exercise', label: '动作', type: 'text', placeholder: '深蹲 / 卧推 / 跑步', required: true },
      { name: 'sets', label: '组数', type: 'number', min: 0, step: 1 },
      { name: 'reps', label: '每组次数', type: 'number', min: 0, step: 1 },
      { name: 'weight_kg', label: '重量 kg', type: 'number', min: 0, step: 0.5, placeholder: '自重/跑步填 0' },
      { name: 'rpe', label: 'RPE 1-10', type: 'number', min: 0, max: 10, step: 0.5 },
      { name: 'note', label: '备注', type: 'text', placeholder: '可选', span: 2 }
    ]
  },
  sleep: {
    title: '记录睡眠', hint: '记录上床、起床、时长、质量和设备数据。', listTitle: '今日睡眠记录', listHint: '填写上床和起床时间后会自动计算时长。', icon: '🌙',
    fields: [
      { name: 'bedtime', label: '上床时间', type: 'time', required: true },
      { name: 'wake', label: '起床时间', type: 'time', required: true },
      { name: 'duration_h', label: '睡眠时长 h', type: 'number', min: 0, step: 0.1, placeholder: '可留空' },
      { name: 'quality', label: '质量 1-5', type: 'number', min: 1, max: 5, step: 1 },
      { name: 'device_note', label: '设备数据', type: 'text', placeholder: '例如 Oura：7h32m', span: 2 },
      { name: 'note', label: '备注', type: 'text', placeholder: '可选', span: 2 }
    ]
  },
  work: {
    title: '记录工作', hint: '记录深度工作时段、产出和干扰。', listTitle: '今日工作记录', listHint: '深度工作总时长会自动汇总。', icon: '💻',
    fields: [
      { name: 'start', label: '开始时间', type: 'time', required: true },
      { name: 'end', label: '结束时间', type: 'time', required: true },
      { name: 'task', label: '任务', type: 'text', placeholder: '写方案 / 数据分析 / 阅读', required: true, span: 2 },
      { name: 'output', label: '产出', type: 'text', placeholder: '完成了什么' },
      { name: 'distraction', label: '干扰', type: 'text', placeholder: '例如微信 20 分钟' },
      { name: 'note', label: '备注', type: 'text', placeholder: '可选', span: 2 }
    ]
  }
};

function todayStr() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nowTime() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week}`;
}
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function round(n, digits = 1) { return Math.round(num(n) * Math.pow(10, digits)) / Math.pow(10, digits); }
function sum(list, key) { return list.reduce((acc, item) => acc + num(item[key]), 0); }
function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some(n => !Number.isFinite(n))) return 0;
  let a = sh * 60 + sm, b = eh * 60 + em;
  if (b < a) b += 24 * 60;
  return (b - a) / 60;
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast._timer); toast._timer = setTimeout(() => el.classList.remove('show'), 2200);
}
function setBar(id, percent) { const el = document.getElementById(id); if (el) el.style.width = `${Math.max(0, Math.min(100, percent))}%`; }

function loadStore() {
  try { const raw = localStorage.getItem(STORE_KEY); const data = raw ? JSON.parse(raw) : null; return data && data.entries ? data : { entries: {} }; }
  catch { return { entries: {} }; }
}
function saveStore(store) { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { toast('保存失败：浏览器存储空间不足'); } }
function loadConfig() {
  try { const raw = localStorage.getItem(CONFIG_KEY); const c = raw ? JSON.parse(raw) : null; return c && c.targets ? c : JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
  catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}
function saveConfig(c) { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch { toast('保存失败：浏览器存储空间不足'); } }
function getEntries(date) { const s = loadStore(); return Array.isArray(s.entries[date]) ? s.entries[date] : []; }
function setEntries(date, entries) { const s = loadStore(); s.entries[date] = entries; saveStore(s); }
function addEntry(date, entry) { const entries = getEntries(date); entries.push(entry); setEntries(date, entries); }
function deleteEntry(date, index) { const entries = getEntries(date); entries.splice(index, 1); setEntries(date, entries); }

function switchView(view) {
  $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  $$('.bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'record') renderRecordView();
  if (view === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderHeader() { $('#dateLabel').textContent = formatDateLabel(state.date); $('#datePicker').value = state.date; }

function renderMetrics() {
  const entries = state.entries || [], targets = state.config?.targets || {};
  const food = entries.filter(e => e.type === 'food'), training = entries.filter(e => e.type === 'training'), sleep = entries.filter(e => e.type === 'sleep'), work = entries.filter(e => e.type === 'work');
  const protein = sum(food, 'protein_g');
  const sets = sum(training, 'sets');
  const sleepHours = sleep.reduce((acc, s) => acc + (num(s.duration_h) || hoursBetween(s.bedtime, s.wake)), 0);
  const workHours = work.reduce((acc, w) => acc + hoursBetween(w.start, w.end), 0);
  $('#metricProtein').textContent = round(protein, 1);
  $('#metricSleep').textContent = round(sleepHours, 2);
  $('#metricSets').textContent = round(sets, 0);
  $('#metricWork').textContent = round(workHours, 2);
  $('#targetProteinMini').textContent = targets.protein_g ?? 140;
  $('#targetSleepMini').textContent = targets.sleep_hours ?? 7.5;
  $('#targetWorkMini').textContent = targets.deep_work_hours ?? 4;
  setBar('barProtein', protein / Math.max(1, num(targets.protein_g)) * 100);
  setBar('barSleep', sleepHours / Math.max(0.1, num(targets.sleep_hours)) * 100);
  setBar('barTraining', sets / Math.max(1, num(targets.training_days_per_week) * 3) * 100);
  setBar('barWork', workHours / Math.max(0.1, num(targets.deep_work_hours)) * 100);
}

function timelineText(e) {
  switch (e.type) {
    case 'food': return { icon: '🍽️', title: `${e.meal || '吃饭'} · ${e.items || ''}`, meta: `${round(e.kcal, 0)} kcal · 蛋白质 ${round(e.protein_g, 0)} g${e.note ? ' · ' + e.note : ''}`, time: e.time || '' };
    case 'training': return { icon: '🏋️', title: e.exercise || '训练', meta: `${round(e.sets, 0)} 组 × ${round(e.reps, 0)} 次 × ${round(e.weight_kg, 1)} kg · RPE ${round(e.rpe, 1)}${e.note ? ' · ' + e.note : ''}`, time: e.time || '' };
    case 'sleep': return { icon: '🌙', title: `睡眠 ${round(e.duration_h || hoursBetween(e.bedtime, e.wake), 2)} h`, meta: `${e.bedtime || ''} - ${e.wake || ''} · 质量 ${round(e.quality, 0)}/5${e.device_note ? ' · ' + e.device_note : ''}`, time: e.bedtime || '' };
    case 'work': return { icon: '💻', title: e.task || '工作', meta: `${e.start || ''}-${e.end || ''} · 产出：${e.output || '未填写'} · 干扰：${e.distraction || '未填写'}`, time: e.start || '' };
    case 'note': return { icon: '📝', title: '随笔', meta: e.text || '', time: '' };
    default: return { icon: '•', title: e.type || '记录', meta: JSON.stringify(e), time: '' };
  }
}

function renderTimeline() {
  const el = $('#timeline');
  const items = state.entries.map((entry, index) => ({ entry, index }));
  items.sort((a, b) => String(timelineText(a.entry).time || '99:99').localeCompare(String(timelineText(b.entry).time || '99:99')));
  $('#entryCount').textContent = `${state.entries.length} 条`;
  if (!items.length) { el.className = 'timeline empty'; el.textContent = '还没有记录，点击“记录”开始。'; return; }
  el.className = 'timeline';
  el.innerHTML = items.map(({ entry, index }) => {
    const t = timelineText(entry);
    const cls = entry.type === 'training' ? 'training' : entry.type === 'sleep' ? 'sleep' : entry.type === 'work' ? 'work' : entry.type === 'note' ? 'note' : '';
    return `<div class="timeline-item"><div class="timeline-icon ${cls}">${t.icon}</div><div class="timeline-body"><div class="timeline-title">${escapeHtml(t.title)}</div><div class="timeline-meta">${escapeHtml(t.meta)}</div></div><div class="timeline-time">${escapeHtml(t.time)}</div><button class="delete-btn" data-index="${index}" title="删除">×</button></div>`;
  }).join('');
}

function fieldHtml(field, value = '') {
  const span = field.span === 2 ? ' span-2' : '';
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const min = field.min !== undefined ? ` min="${field.min}"` : '';
  const max = field.max !== undefined ? ` max="${field.max}"` : '';
  const step = field.step !== undefined ? ` step="${field.step}"` : '';
  if (field.type === 'select') {
    const options = field.options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');
    return `<label class="${span.trim()}">${escapeHtml(field.label)}<select name="${field.name}"${required}>${options}</select></label>`;
  }
  return `<label class="${span.trim()}">${escapeHtml(field.label)}<input type="${field.type}" name="${field.name}" value="${escapeHtml(value)}"${placeholder}${min}${max}${step}${required}></label>`;
}

function renderRecordView() {
  const cfg = recordConfig[state.activeRecordType];
  $$('#recordTabs .tab').forEach(tab => tab.classList.toggle('active', tab.dataset.type === state.activeRecordType));
  $('#formTitle').textContent = cfg.title; $('#formHint').textContent = cfg.hint;
  $('#listTitle').textContent = cfg.listTitle; $('#listHint').textContent = cfg.listHint;
  const defaults = state.activeRecordType === 'food' || state.activeRecordType === 'training' ? { time: nowTime() } : state.activeRecordType === 'work' ? { start: nowTime() } : {};
  $('#recordForm').innerHTML = cfg.fields.map(f => fieldHtml(f, defaults[f.name] ?? '')).join('') + '<button class="primary-btn" type="submit">保存记录</button>';
  renderRecordList();
}

function renderRecordList() {
  const type = state.activeRecordType;
  const entries = state.entries.map((entry, index) => ({ entry, index })).filter(x => x.entry.type === type);
  const el = $('#recordList');
  $('#listCount').textContent = `${entries.length} 条`;
  if (!entries.length) { el.className = 'entry-list empty'; el.textContent = '暂无记录。'; return; }
  el.className = 'entry-list';
  el.innerHTML = entries.map(({ entry, index }) => {
    const t = timelineText(entry);
    return `<div class="entry-item"><div class="entry-main"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.meta)}</span></div><button class="delete-btn" data-index="${index}" title="删除">×</button></div>`;
  }).join('');
}

function summarize(entries) {
  const food = entries.filter(e => e.type === 'food'), training = entries.filter(e => e.type === 'training'), sleep = entries.filter(e => e.type === 'sleep'), work = entries.filter(e => e.type === 'work');
  const kcal = sum(food, 'kcal'), protein = sum(food, 'protein_g'), sets = sum(training, 'sets');
  const volume = training.reduce((acc, t) => acc + num(t.sets) * num(t.reps) * num(t.weight_kg), 0);
  const sleepHours = sleep.reduce((acc, s) => acc + (num(s.duration_h) || hoursBetween(s.bedtime, s.wake)), 0);
  const qualities = sleep.map(s => num(s.quality)).filter(v => v > 0);
  const avgQuality = qualities.length ? round(qualities.reduce((a, b) => a + b, 0) / qualities.length, 1) : 0;
  const workHours = work.reduce((acc, w) => acc + hoursBetween(w.start, w.end), 0);
  return { entries, counts: { food: food.length, training: training.length, sleep: sleep.length, work: work.length }, totals: { kcal: round(kcal, 1), protein_g: round(protein, 1), sets: round(sets, 1), volume_kg: round(volume, 1), sleep_h: round(sleepHours, 2), sleep_quality: avgQuality, work_h: round(workHours, 2) } };
}

function buildPromptPayload() {
  const entries = state.entries || [], targets = state.config?.targets || {};
  const summary = summarize(entries);
  const lines = entries.map(e => '- ' + timelineText(e).meta);
  const raw = lines.length ? lines.join('\n') : '（今天还没有记录。）';
  const targetText = `蛋白质目标：${targets.protein_g ?? 140} g；热量缺口目标：${targets.calories_deficit_kcal ?? 600} kcal；睡眠目标：${targets.sleep_hours ?? 7.5} h；每周训练：${targets.training_days_per_week ?? 3} 次；深度工作目标：${targets.deep_work_hours ?? 4} h`;
  const template = `你是一名严谨的生活教练和数据分析师。请根据我提供的 {{date}} 数据，生成一份中文日报。\n\n我的目标：\n{{targets}}\n\n请按以下结构输出：\n1. 今日一句话总结\n2. 吃饭：总热量、蛋白质、饮食质量、问题与建议\n3. 训练：训练量、强度、动作质量、恢复建议\n4. 睡眠：时长、质量、可能的影响\n5. 工作：深度工作产出、干扰、改进点\n6. 今天做得好的 3 件事\n7. 明天最重要的 3 个动作\n8. 需要我补充的数据\n\n要求：\n- 只根据数据说话；数据不足时明确说“数据不足”，不要编造。\n- 建议要具体、可执行，不要空泛鸡汤。\n- 涉及健康、医疗、用药时，提醒我咨询专业人士。\n- 不要给我投资建议。\n\n以下是今天的原始数据：\n---\n{{data}}\n---`;
  return { prompt: template.replaceAll('{{date}}', state.date).replaceAll('{{targets}}', targetText).replaceAll('{{data}}', raw), summary, targets: targetText, raw };
}

function renderAiSummary(summary) {
  if (!summary) { $('#aiSummary').textContent = '记录几条数据后，这里会显示摘要。'; return; }
  const t = summary.totals || {};
  $('#aiSummary').innerHTML = `今日已记录 <strong>${summary.entries?.length ?? 0}</strong> 条：热量 ${round(t.kcal, 0)} kcal，蛋白质 ${round(t.protein_g, 0)} g，睡眠 ${round(t.sleep_h, 2)} h，深度工作 ${round(t.work_h, 2)} h。`;
}
function renderReportSummary(summary) {
  const el = $('#reportSummary');
  if (!summary) { el.innerHTML = ''; return; }
  const t = summary.totals || {};
  const chips = [['热量', `${round(t.kcal, 0)} kcal`], ['蛋白质', `${round(t.protein_g, 0)} g`], ['睡眠', `${round(t.sleep_h, 2)} h`], ['深度工作', `${round(t.work_h, 2)} h`], ['训练', `${round(t.sets, 0)} 组 / ${round(t.volume_kg, 0)} kg`]];
  el.innerHTML = chips.map(([label, value]) => `<div class="summary-chip"><span>${label}</span><strong>${value}</strong></div>`).join('');
}
function renderSettings() {
  const t = state.config?.targets || {};
  $('#settingProtein').value = t.protein_g ?? 140; $('#settingCalories').value = t.calories_deficit_kcal ?? 600; $('#settingSleep').value = t.sleep_hours ?? 7.5; $('#settingTraining').value = t.training_days_per_week ?? 3; $('#settingWork').value = t.deep_work_hours ?? 4;
}
function renderAll() { renderHeader(); renderMetrics(); renderTimeline(); renderRecordView(); renderAiSummary(null); renderSettings(); }

function loadData() { state.entries = getEntries(state.date); renderAll(); }

function generatePrompt() {
  const payload = buildPromptPayload();
  state.promptPayload = payload;
  $('#dashPrompt').value = payload.prompt; $('#reportPrompt').value = payload.prompt;
  renderAiSummary(payload.summary); renderReportSummary(payload.summary);
  toast('AI 提示词已生成');
}
async function copyPrompt(text) {
  if (!text) { toast('请先生成提示词'); return; }
  try { await navigator.clipboard.writeText(text); toast('提示词已复制'); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('提示词已复制'); }
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadReport() {
  const p = buildPromptPayload(), t = p.summary.totals;
  const report = `# ${state.date} 生活AI化日报\n\n## 数据汇总\n- 吃饭：${p.summary.counts.food} 条记录，总热量 ${t.kcal} kcal，总蛋白质 ${t.protein_g} g\n- 训练：${p.summary.counts.training} 条记录，总组数 ${t.sets} 组，估算训练容量 ${t.volume_kg} kg\n- 睡眠：${p.summary.counts.sleep} 条记录，总时长 ${t.sleep_h} h，平均质量 ${t.sleep_quality}/5\n- 工作：${p.summary.counts.work} 条记录，总时长 ${t.work_h} h\n\n## AI 日报提示词\n\`\`\`text\n${p.prompt}\n\`\`\`\n`;
  downloadBlob(new Blob([report], { type: 'text/markdown;charset=utf-8' }), `日报_${state.date}.md`);
  toast('Markdown 日报已下载');
}
function exportData() {
  const data = { version: 1, exportedAt: new Date().toISOString(), config: state.config, store: loadStore() };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `life-ai-backup-${state.date}.json`);
  toast('备份已导出');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.config) { state.config = data.config; saveConfig(state.config); }
      if (data.store) { saveStore(data.store); }
      loadData(); toast('数据已导入');
    } catch { toast('导入失败：文件格式不正确'); }
  };
  reader.readAsText(file);
}

function bindNav() {
  $$('.bottom-nav-item').forEach(btn => btn.addEventListener('click', () => { location.hash = btn.dataset.view; switchView(btn.dataset.view); }));
  $('#jumpRecord').addEventListener('click', () => { location.hash = 'record'; switchView('record'); });
}
function bindDate() { $('#datePicker').addEventListener('change', e => { state.date = e.target.value || todayStr(); loadData(); }); }
function bindRecordTabs() {
  $$('#recordTabs .tab').forEach(tab => tab.addEventListener('click', () => { state.activeRecordType = tab.dataset.type; renderRecordView(); }));
  $('#recordForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target), entry = { type: state.activeRecordType };
    for (const [key, value] of fd.entries()) {
      const field = recordConfig[state.activeRecordType].fields.find(f => f.name === key);
      entry[key] = field?.type === 'number' ? num(value) : value;
    }
    addEntry(state.date, entry); toast('记录已保存'); loadData(); switchView('record');
  });
}
function bindDashboard() { $('#dashPromptBtn').addEventListener('click', generatePrompt); $('#dashCopyBtn').addEventListener('click', () => copyPrompt($('#dashPrompt').value)); $('#dashReportBtn').addEventListener('click', downloadReport); }
function bindReport() { $('#reportPromptBtn').addEventListener('click', generatePrompt); $('#reportCopyBtn').addEventListener('click', () => copyPrompt($('#reportPrompt').value)); $('#reportDownloadBtn').addEventListener('click', downloadReport); }
function bindSettings() {
  $('#settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const next = JSON.parse(JSON.stringify(state.config || DEFAULT_CONFIG));
    next.targets = { protein_g: num($('#settingProtein').value), calories_deficit_kcal: num($('#settingCalories').value), sleep_hours: num($('#settingSleep').value), training_days_per_week: num($('#settingTraining').value), deep_work_hours: num($('#settingWork').value) };
    state.config = next; saveConfig(next); renderMetrics(); toast('设置已保存');
  });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#clearDayBtn').addEventListener('click', () => { if (confirm('确定清空今天的数据吗？此操作不可恢复。')) { setEntries(state.date, []); loadData(); toast('今天的数据已清空'); } });
  $('#installBtn').addEventListener('click', async () => { if (state.deferredPrompt) { state.deferredPrompt.prompt(); state.deferredPrompt = null; $('#installBtn').style.display = 'none'; } });
}
function bindDelete() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    if (!Number.isInteger(index)) return;
    if (confirm('确定删除这条记录吗？')) { deleteEntry(state.date, index); toast('已删除'); loadData(); switchView('record'); }
  });
}
function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}
function bindInstall() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; $('#installBtn').style.display = 'inline-flex'; });
}

async function init() {
  state.config = loadConfig();
  bindNav(); bindDate(); bindRecordTabs(); bindDashboard(); bindReport(); bindSettings(); bindDelete(); bindInstall(); registerServiceWorker();
  renderHeader(); await loadData();
  const hash = location.hash.replace('#', '');
  if (viewMeta[hash]) switchView(hash);
}
window.addEventListener('hashchange', () => { const view = location.hash.replace('#', ''); if (viewMeta[view]) switchView(view); });
document.addEventListener('DOMContentLoaded', init);