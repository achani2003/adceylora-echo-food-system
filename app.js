// 1) Paste your Supabase project values (Project Settings > API)
const SUPABASE_URL = 'https://gtarqmjqldkiyedsfnzz.supabase.co', SUPABASE_KEY = 'sb_publishable_qnqkP3TNP34jAlybHyh01w_FEn_WaTG';
if (!window.supabase) { alert('Supabase library did not load. Check your internet connection and reload.'); throw new Error('supabase missing'); }
const db = supabase.createClient(SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''), SUPABASE_KEY.trim());
const $ = s => document.querySelector(s);
const S = { view: 'dashboard', owner: true, products: [], variants: [], proc: [], logs: [], batches: [], sales: [] };
const rs = n => 'Rs. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const fd = d => d.split('-').reverse().join('/');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const money = v => S.owner ? rs(v) : '🔒';
const vname = id => { const v = S.variants.find(x => x.id === id), p = v && S.products.find(x => x.id === v.product_id); return v ? `${p?.name} ${v.size}` : '—'; };
const saleStatus = s => s.received >= s.total_bill ? 'PAID' : s.received > 0 ? 'PARTIAL' : 'PENDING';
function toast(m, bad) { const d = document.createElement('div'); d.textContent = m; if (bad) d.className = 'bad'; $('#toast').append(d); setTimeout(() => d.remove(), 3800); }

// ---------- auth ----------
$('#login form').onsubmit = async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  toast('Signing in...');
  const { error } = await db.auth.signInWithPassword(f); if (error) toast(error.message, 1);
};
$('#out').onclick = () => db.auth.signOut();
$('#role').onclick = () => { S.owner = !S.owner; $('#role').textContent = S.owner ? 'Owner view' : 'Staff view'; render(); };
db.auth.onAuthStateChange((_, session) => {
  $('#login').hidden = !!session; $('#app').hidden = !session;
  if (session) load();
});

// ---------- data ----------
async function load() {
  const q = (t, col, asc) => db.from(t).select('*').order(col, { ascending: !!asc });
  const r = await Promise.all([q('products', 'name', 1), q('variants', 'size', 1), q('procurement', 'date'), q('pack_logs', 'date'), q('batches', 'date'), q('sales', 'created_at')]);
  const bad = r.find(x => x.error); if (bad) return toast(bad.error.message, 1);
  [S.products, S.variants, S.proc, S.logs, S.batches, S.sales] = r.map(x => x.data);
  render();
}
async function run(p, ok) { const { error } = await p; if (error) return toast(error.message.includes('stock') || error.message.includes('check') ? 'Not enough stock for this change' : error.message, 1); toast(ok); load(); }
const del = (t, id) => confirm('Delete this record?') && run(db.from(t).delete().eq('id', id), 'Deleted');

// ---------- generic modal form ----------
function form(title, fields, save) {
  const m = $('#modal');
  m.innerHTML = `<form><h3>${title}</h3>${fields.map(f => `<label>${f.l}${f.o
    ? `<select name="${f.k}">${f.o.map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select>`
    : `<input name="${f.k}" type="${f.t || 'text'}" value="${esc(f.v ?? '')}" ${f.t === 'number' ? 'step="any" min="0"' : ''} ${f.opt ? '' : 'required'}>`}</label>`).join('')}
    <div class="row"><button type="button" class="ghost" id="cx">Cancel</button><button>Save</button></div></form>`;
  m.showModal(); $('#cx').onclick = () => m.close();
  m.querySelector('form').onsubmit = async e => { e.preventDefault(); await save(Object.fromEntries(new FormData(e.target))); m.close(); };
}
const variantOpts = () => S.variants.map(v => [v.id, `${vname(v.id)} (stock ${v.stock})`]);

// ---------- actions ----------
const addProduct = () => form('New product', [{ k: 'name', l: 'Product name' }, { k: 'sizes', l: 'Pack sizes (comma separated)', v: '50g,100g,1kg' }], async f => {
  const { data, error } = await db.from('products').insert({ name: f.name.trim() }).select().single(); if (error) return toast(error.message, 1);
  const rows = f.sizes.split(',').map(s => s.trim()).filter(Boolean).map(size => ({ product_id: data.id, size }));
  run(db.from('variants').insert(rows), 'Product added');
});
const addProc = () => form('Raw material purchase', [
  { k: 'date', l: 'Date', t: 'date', v: today() }, { k: 'supplier', l: 'Supplier' }, { k: 'item', l: 'Item' },
  { k: 'qty', l: 'Fresh qty (Kg)', t: 'number' }, { k: 'unit_price', l: 'Unit price (Rs/Kg, 0 if free)', t: 'number' },
  { k: 'paid', l: 'Paid?', o: [['YES', 'YES'], ['NO', 'NO'], ['free', 'free']] }, { k: 'deduct', l: 'Deduct from revenue?', o: [['true', 'Yes'], ['false', 'No']] }],
  f => run(db.from('procurement').insert({ ...f, deduct: f.deduct === 'true' }), 'Purchase saved'));
const addLog = () => form('Packing log', [{ k: 'date', l: 'Date', t: 'date', v: today() }, { k: 'variant_id', l: 'Product & size', o: variantOpts() }, { k: 'qty', l: 'Packs made', t: 'number' }],
  f => run(db.from('pack_logs').insert({ ...f, qty: +f.qty }), 'Stock increased'));
const setStock = id => { const v = S.variants.find(x => x.id === id); form(vname(id), [{ k: 'stock', l: 'Set exact stock', t: 'number', v: v.stock }], f => run(db.from('variants').update({ stock: Math.round(f.stock) }).eq('id', id), 'Stock updated')); };
const addBatch = () => form('Dehydration batch', [{ k: 'date', l: 'Date', t: 'date', v: today() }, { k: 'item', l: 'Raw item' }, { k: 'fresh', l: 'Fresh input (Kg)', t: 'number' }, { k: 'dry', l: 'Dry output (Kg)', t: 'number' },
  { k: 'status', l: 'Status', o: [['COMPLETED', 'COMPLETED'], ['IN_PROGRESS', 'IN_PROGRESS']] }],
  f => run(db.from('batches').insert({ ...f, code: 'BATCH-' + f.date.replace(/-/g, '') + '-' + (S.batches.length + 1) }), 'Batch saved'));
const addSale = () => form('Market sale (stock deducts automatically)', [{ k: 'date', l: 'Date', t: 'date', v: today() }, { k: 'market', l: 'Market / store' }, { k: 'variant_id', l: 'Product & size', o: variantOpts() },
  { k: 'qty', l: 'Packs sold', t: 'number' }, { k: 'unit_price', l: 'Unit price (Rs/pack)', t: 'number' }, { k: 'received', l: 'Amount received (Rs)', t: 'number' }],
  f => run(db.from('sales').insert({ ...f, qty: +f.qty, unit_price: +f.unit_price, received: +f.received }), 'Sale saved, stock deducted'));
const receive = id => { const s = S.sales.find(x => x.id === id); form(`Receive payment · INV-${s.invoice_no}`, [{ k: 'amt', l: `Cash received (pending ${rs(s.total_bill - s.received)})`, t: 'number' }],
  f => run(db.from('sales').update({ received: +s.received + +f.amt }).eq('id', id), 'Payment recorded')); };

// ---------- views ----------
const tbl = (cols, rows, empty) => rows.length ? `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="card empty">${empty}</div>`;
const head = (t, btn, fn) => `<div class="bar"><h2>${t}</h2>${btn ? `<button onclick="${fn}()">${btn}</button>` : ''}</div>`;
const delBtn = (t, id) => `<button class="del acts" onclick="del('${t}','${id}')" aria-label="Delete">🗑 Delete</button>`;
const money_ = {
  collected: () => S.sales.reduce((a, s) => a + +s.received, 0),
  pending: () => S.sales.reduce((a, s) => a + (s.total_bill - s.received), 0),
  rm: () => S.proc.filter(p => p.paid === 'YES' && p.deduct).reduce((a, p) => a + +p.total_cost, 0),
  payable: () => S.proc.filter(p => p.paid === 'NO').reduce((a, p) => a + +p.total_cost, 0)
};
let charts = [];
const V = {
  dashboard() {
    const packs = S.variants.reduce((a, v) => a + v.stock, 0), net = Math.max(0, money_.collected() - money_.rm());
    const cards = S.products.map(p => `<div class="card"><b>${esc(p.name)}</b>${S.variants.filter(v => v.product_id === p.id).map(v => `<div class="sz"><span>${v.size}</span><span class="${v.stock < 10 ? 'low' : ''}">${v.stock}</span></div>`).join('')}</div>`).join('');
    return head('පාලන පුවරුව', '+ Market sale', 'addSale') + `<div class="kpis">
      <div class="card kpi"><span>Packs in stock</span><b>${packs}</b></div><div class="card kpi"><span>Net revenue (collected − raw material)</span><b>${money(net)}</b></div>
      <div class="card kpi"><span>Receivable from markets</span><b>${money(money_.pending())}</b></div><div class="card kpi"><span>Owed to suppliers</span><b>${money(money_.payable())}</b></div></div>
      <div class="grid2"><div class="card"><div class="chart"><canvas id="c1"></canvas></div></div><div class="card"><div class="chart"><canvas id="c2"></canvas></div></div></div>
      <h3>Live stock</h3><div class="stock">${cards || '<div class="card empty">No products yet.</div>'}</div>`;
  },
  procurement() {
    return head('අමුද්‍රව්‍ය පොත', '+ Add purchase', 'addProc') + tbl([['Date', r => fd(r.date)], ['Supplier', r => esc(r.supplier)], ['Item', r => esc(r.item)], ['Qty (Kg)', r => r.qty, 'r'],
      ['Unit price', r => money(r.unit_price), 'r'], ['Total', r => money(r.total_cost), 'r'], ['Paid', r => `<span class="tag ${r.paid}">${r.paid}</span>`], ['', r => delBtn('procurement', r.id)]], S.proc, 'No purchases yet. Add your first raw material purchase.');
  },
  stock() {
    const boxes = S.products.map(p => `<div class="card"><b>${esc(p.name)}</b>${S.variants.filter(v => v.product_id === p.id).map(v => `<div class="sz"><span>${v.size}: <b>${v.stock}</b></span><button class="ghost acts" onclick="setStock('${v.id}')">Set</button></div>`).join('')}
      <button class="del acts" onclick="del('products','${p.id}')">Remove product</button></div>`).join('');
    return `<div class="bar"><h2>පැකට් Stock</h2><div class="row"><button class="ghost" onclick="addProduct()">+ Product</button><button onclick="addLog()">+ Packing log</button></div></div><div class="stock" style="margin-bottom:18px">${boxes}</div>` +
      tbl([['Date', r => fd(r.date)], ['Product & size', r => esc(vname(r.variant_id))], ['Packs made', r => r.qty, 'r'], ['', r => delBtn('pack_logs', r.id)]], S.logs, 'No packing logs yet.');
  },
  dehydration() {
    return head('වියළීම (Yield)', '+ New batch', 'addBatch') + tbl([['Batch', r => r.code], ['Date', r => fd(r.date)], ['Item', r => esc(r.item)], ['Fresh Kg', r => r.fresh, 'r'], ['Dry Kg', r => r.dry, 'r'],
      ['Yield %', r => (r.dry / r.fresh * 100).toFixed(1), 'r'], ['Moisture loss %', r => (100 - r.dry / r.fresh * 100).toFixed(1), 'r'], ['Status', r => r.status], ['', r => delBtn('batches', r.id)]], S.batches, 'No batches yet.');
  },
  sales() {
    return head('විකුණුම්', '+ Market sale', 'addSale') + tbl([['Invoice', r => 'INV-' + r.invoice_no], ['Date', r => fd(r.date)], ['Store', r => esc(r.market)], ['Product', r => esc(vname(r.variant_id))], ['Packs', r => r.qty, 'r'],
      ['Bill', r => money(r.total_bill), 'r'], ['Received', r => money(r.received), 'r'], ['Pending', r => money(r.total_bill - r.received), 'r'], ['Status', r => `<span class="tag ${saleStatus(r)}">${saleStatus(r)}</span>`],
      ['', r => `<span class="acts">${saleStatus(r) === 'PAID' ? '' : `<button class="ghost" onclick="receive('${r.id}')">+ Pay</button>`}${delBtn('sales', r.id).replace('class="del acts"', 'class="del"')}</span>`]], S.sales, 'No sales yet. Record a market sale and stock will deduct itself.');
  }
};
function render() {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  $('#view').innerHTML = V[S.view]();
  charts.forEach(c => c.destroy()); charts = [];
  if (S.view === 'dashboard' && window.Chart) {
    const tot = p => S.variants.filter(v => v.product_id === p.id).reduce((a, v) => a + v.stock, 0);
    charts.push(new Chart($('#c1'), { type: 'bar', data: { labels: S.products.map(p => p.name), datasets: [{ label: 'Packs in stock', data: S.products.map(tot), backgroundColor: '#2f5d3a', borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
    charts.push(new Chart($('#c2'), { type: 'doughnut', data: { labels: ['Net revenue', 'Raw material', 'Receivable'], datasets: [{ data: S.owner ? [Math.max(0, money_.collected() - money_.rm()), money_.rm(), money_.pending()] : [1, 0, 0], backgroundColor: ['#2f5d3a', '#b5472f', '#d9a21b'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));
  }
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => { S.view = b.dataset.v; render(); });
db.auth.getSession().then(({ data }) => { if (!data.session) $('#login').hidden = false; });