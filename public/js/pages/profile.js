import { api, fileToBase64 } from '../api.js';
import { state, logout } from '../state.js';
import { renderChrome, esc, naira, verifiedBadge, toast, requireLogin } from '../components.js';
import { navigate } from '../router.js';

export async function renderProfile(root) {
  if (!requireLogin()) return;
  if (state.user.role === 'provider') return renderProviderDashboard(root);
  if (state.user.role === 'admin') { navigate('#/admin'); return; }
  return renderCustomerProfile(root);
}

function renderCustomerProfile(root) {
  root.innerHTML = `
    <div class="screen">
      <h2>My account</h2>
      <div class="card" style="margin-top:14px;">
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="list-row__avatar" style="width:56px;height:56px;font-size:1.3rem;">${esc(state.user.full_name[0].toUpperCase())}</div>
          <div>
            <b style="font-size:1.05rem;">${esc(state.user.full_name)}</b>
            <p class="muted">${esc(state.user.phone)}</p>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="list-row" data-goto="#/favorites"><div class="list-row__body"><b>☆ Saved professionals</b></div></div>
        <div class="list-row" data-goto="#/requests"><div class="list-row__body"><b>🧾 My requests</b></div></div>
        <div class="list-row" data-goto="#/notifications"><div class="list-row__body"><b>🔔 Notifications</b></div></div>
      </div>
      <button class="btn btn--danger" id="logout-btn">Log out</button>
    </div>`;
  renderChrome(root, '/profile');
  root.querySelector('#logout-btn').addEventListener('click', async () => {
    await logout();
    navigate('#/');
    toast('Logged out', 'success');
  });
}

async function renderProviderDashboard(root) {
  root.innerHTML = `<div class="screen"><div class="skeleton" style="height:200px;"></div></div>`;
  renderChrome(root, '/profile');

  let p;
  try { p = await api.get('/me/provider-profile'); }
  catch (e) { root.querySelector('.screen').innerHTML = `<p>${esc(e.message)}</p>`; return; }

  const screen = root.querySelector('.screen');
  screen.innerHTML = `
    <div class="profile-hero">
      <div class="profile-hero__top">
        <div class="profile-hero__photo" id="photo-preview">${p.profilePhoto ? `<img src="${esc(p.profilePhoto)}">` : '📷'}</div>
        <div>
          <h2>${esc(p.name)}</h2>
          <div class="meta">${verifiedBadge(p.verificationStatus)} ${p.verificationStatus !== 'VERIFIED' ? `<span class="pill pill--busy">${esc(p.verificationStatus)}</span>` : ''}</div>
        </div>
      </div>
      <div class="profile-hero__stats">
        <div><b>${p.avgRating ? p.avgRating.toFixed(1) : '—'}★</b><span>${p.reviewCount} reviews</span></div>
        <div><b>${p.completedJobs}</b><span>jobs done</span></div>
        <div><b>${naira(p.startingPrice)}</b><span>starting price</span></div>
      </div>
    </div>

    <label class="btn btn--outline" style="margin-bottom:14px;">Change profile photo<input type="file" id="photo-input" accept="image/*" style="display:none;"></label>

    <div class="tabs" id="pd-tabs">
      <div class="tab active" data-tab="edit">Profile</div>
      <div class="tab" data-tab="verify">Verification</div>
      <div class="tab" data-tab="portfolio">Portfolio</div>
      <div class="tab" data-tab="earnings">Job history</div>
    </div>
    <div id="pd-content"></div>
    <button class="btn btn--danger" id="logout-btn" style="margin-top:8px;">Log out</button>
  `;

  screen.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    try {
      const res = await api.post('/me/provider-profile/photo', { imageBase64: base64 });
      screen.querySelector('#photo-preview').innerHTML = `<img src="${esc(res.profilePhoto)}">`;
      toast('Photo updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  screen.querySelector('#logout-btn').addEventListener('click', async () => { await logout(); navigate('#/'); });

  const content = screen.querySelector('#pd-content');
  const tabs = screen.querySelectorAll('#pd-tabs .tab');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    drawTab(tab.dataset.tab);
  }));

  async function drawTab(name) {
    if (name === 'edit') return drawEdit();
    if (name === 'verify') return drawVerify();
    if (name === 'portfolio') return drawPortfolio();
    if (name === 'earnings') return drawEarnings();
  }

  async function drawEdit() {
    const [categories, states] = await Promise.all([
      api.get('/categories'),
      api.get('/locations/states'),
    ]);
    const selectedCatIds = new Set((p.categories || []).map((c) => c.id));
    content.innerHTML = `
      <div class="card">
        <div class="field"><label>Business name</label><input id="e-business" value="${esc(p.name || '')}" /></div>
        <div class="field"><label>About / bio</label><textarea id="e-bio">${esc(p.bio || '')}</textarea></div>
        <div class="row-2">
          <div class="field"><label>Years of experience</label><input type="number" id="e-years" value="${p.yearsExperience || 0}" /></div>
          <div class="field"><label>Starting price (₦)</label><input type="number" id="e-price" value="${p.startingPrice || 0}" /></div>
        </div>
        <div class="field"><label>WhatsApp number</label><input id="e-whatsapp" value="${esc(p.whatsapp || '')}" placeholder="+234..." /></div>
        <div class="field">
          <label>Availability</label>
          <select id="e-availability">
            <option value="AVAILABLE" ${p.availability === 'AVAILABLE' ? 'selected' : ''}>Available now</option>
            <option value="BUSY" ${p.availability === 'BUSY' ? 'selected' : ''}>Busy</option>
            <option value="OFFLINE" ${p.availability === 'OFFLINE' ? 'selected' : ''}>Offline</option>
          </select>
        </div>
        <div class="field">
          <label>State</label>
          <select id="e-state"><option value="">Select state</option>${states.map((s) => `<option value="${s}" ${p.location?.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>City / area</label>
          <select id="e-location"><option value="">Select state first</option></select>
        </div>
        <div class="field">
          <label>Service categories</label>
          <div class="chip-select" id="e-cats">
            ${categories.map((c) => `<div class="chip ${selectedCatIds.has(c.id) ? 'active' : ''}" data-id="${c.id}">${c.icon} ${c.name}</div>`).join('')}
          </div>
        </div>
        <button class="btn btn--primary" id="e-save">Save changes</button>
      </div>`;

    async function loadLocations(st) {
      const sel = content.querySelector('#e-location');
      if (!st) { sel.innerHTML = '<option value="">Select state first</option>'; return; }
      const locs = await api.get(`/locations?state=${encodeURIComponent(st)}`);
      sel.innerHTML = locs.map((l) => `<option value="${l.id}" ${p.location?.id === l.id ? 'selected' : ''}>${l.area ? l.area + ', ' : ''}${l.city}</option>`).join('');
    }
    content.querySelector('#e-state').addEventListener('change', (e) => loadLocations(e.target.value));
    if (p.location?.state) loadLocations(p.location.state);

    content.querySelectorAll('#e-cats .chip').forEach((chip) => chip.addEventListener('click', () => chip.classList.toggle('active')));

    content.querySelector('#e-save').addEventListener('click', async () => {
      const btn = content.querySelector('#e-save');
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        await api.patch('/me/provider-profile', {
          businessName: content.querySelector('#e-business').value,
          bio: content.querySelector('#e-bio').value,
          yearsExperience: Number(content.querySelector('#e-years').value) || 0,
          startingPrice: Number(content.querySelector('#e-price').value) || 0,
          whatsapp: content.querySelector('#e-whatsapp').value,
          availability: content.querySelector('#e-availability').value,
          locationId: content.querySelector('#e-location').value || null,
        });
        const catIds = Array.from(content.querySelectorAll('#e-cats .chip.active')).map((c) => c.dataset.id);
        await api.post('/me/provider-profile/categories', { categoryIds: catIds });
        toast('Profile updated', 'success');
        p = await api.get('/me/provider-profile');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Save changes';
      }
    });
  }

  async function drawVerify() {
    const apps = await api.get('/me/verification');
    content.innerHTML = `
      <div class="card">
        ${p.verificationStatus === 'VERIFIED' ? `<div class="info-box">You are a Verified Professional. ✅</div>` : `
        <p class="muted">Submit your details for review. Only administrators can approve verification — this typically means we've confirmed your identity, not that every job will go well.</p>
        <div class="field"><label>Full legal name</label><input id="v-name" /></div>
        <div class="field"><label>Address</label><input id="v-address" /></div>
        <div class="field">
          <label>Government-issued ID (photo)</label>
          <input type="file" id="v-doc" accept="image/*" />
        </div>
        <button class="btn btn--primary" id="v-submit">Submit for verification</button>`}
      </div>
      <div class="card">
        <h3>Past applications</h3>
        ${apps.length ? apps.map((a) => `<div class="list-row"><div class="list-row__body"><b>${esc(a.status)}</b><p>${new Date(a.created_at).toLocaleDateString()}</p></div></div>`).join('') : '<p class="muted">No applications submitted yet.</p>'}
      </div>`;
    const submitBtn = content.querySelector('#v-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const name = content.querySelector('#v-name').value.trim();
        const address = content.querySelector('#v-address').value.trim();
        const file = content.querySelector('#v-doc').files[0];
        if (!name || !address || !file) { toast('Please fill in all fields and attach an ID photo', 'error'); return; }
        submitBtn.disabled = true; submitBtn.textContent = 'Submitting...';
        try {
          const base64 = await fileToBase64(file);
          await api.post('/me/verification', { fullLegalName: name, address, documents: [{ docType: 'GOVERNMENT_ID', base64 }] });
          toast('Verification submitted for review', 'success');
          drawVerify();
        } catch (err) {
          toast(err.message, 'error');
          submitBtn.disabled = false; submitBtn.textContent = 'Submit for verification';
        }
      });
    }
  }

  function drawPortfolio() {
    content.innerHTML = `
      <div class="card">
        <h3>Portfolio photos</h3>
        <div class="photo-grid" id="pf-grid">
          <label class="photo-tile">+<input type="file" id="pf-input" accept="image/*" style="display:none;"></label>
          ${p.portfolio.map((ph) => `<div style="position:relative;"><img src="${esc(ph.path)}"><button data-del="${ph.id}" style="position:absolute;top:4px;right:4px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:22px;height:22px;">×</button></div>`).join('')}
        </div>
      </div>`;
    content.querySelector('#pf-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const base64 = await fileToBase64(file);
      try {
        await api.post('/me/provider-profile/portfolio', { imageBase64: base64 });
        p = await api.get('/me/provider-profile');
        drawPortfolio();
      } catch (err) { toast(err.message, 'error'); }
    });
    content.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      await api.delete(`/me/provider-profile/portfolio/${btn.dataset.del}`);
      p = await api.get('/me/provider-profile');
      drawPortfolio();
    }));
  }

  async function drawEarnings() {
    const rows = await api.get('/requests/mine?status=COMPLETED');
    const total = rows.reduce((sum, r) => sum + (r.agreedPrice || 0), 0);
    content.innerHTML = `
      <div class="stat-grid" style="margin-bottom:14px;">
        <div class="stat-card"><b>${rows.length}</b><span>completed jobs</span></div>
        <div class="stat-card"><b>${naira(total)}</b><span>total agreed value</span></div>
      </div>
      ${rows.length ? rows.map((r) => `
        <div class="card" data-goto="#/requests/${r.id}" style="cursor:pointer;">
          <b>${esc(r.category.name)}</b> — ${esc(r.customer.full_name)}
          <p class="faint" style="margin-top:4px;">${new Date(r.createdAt).toLocaleDateString()} · ${naira(r.agreedPrice)}</p>
        </div>`).join('') : '<p class="muted">No completed jobs yet.</p>'}`;
  }

  drawEdit();
}
