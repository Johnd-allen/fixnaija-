import { api } from '../api.js';
import { state } from '../state.js';
import {
  renderChrome, esc, naira, statusPill, jobTimelineHtml, toast, requireLogin,
  openModal, closeModal, starInputHtml, wireStarInputs, starInputValues,
} from '../components.js';
import { navigate } from '../router.js';

const PROVIDER_ACTIONS = {
  REQUESTED: [{ to: 'ACCEPTED', label: 'Accept request', cls: 'btn--primary', needsPrice: true }, { to: 'REJECTED', label: 'Decline', cls: 'btn--danger' }],
  ACCEPTED: [{ to: 'ON_THE_WAY', label: "I'm on the way", cls: 'btn--primary' }, { to: 'CANCELLED', label: 'Cancel', cls: 'btn--danger' }],
  ON_THE_WAY: [{ to: 'ARRIVED', label: "I've arrived", cls: 'btn--primary' }],
  ARRIVED: [{ to: 'IN_PROGRESS', label: 'Start work', cls: 'btn--primary' }],
  IN_PROGRESS: [{ to: 'COMPLETED', label: 'Mark completed', cls: 'btn--primary' }],
};
const CUSTOMER_ACTIONS = {
  REQUESTED: [{ to: 'CANCELLED', label: 'Cancel request', cls: 'btn--danger' }],
  ACCEPTED: [{ to: 'CANCELLED', label: 'Cancel', cls: 'btn--danger' }],
};

export async function renderRequestDetail(root, params) {
  if (!requireLogin()) return;
  root.innerHTML = `<div class="screen"><div class="skeleton" style="height:200px;"></div></div>`;
  renderChrome(root, '/requests');

  let r;
  try {
    r = await api.get(`/requests/${params.id}`);
  } catch (e) {
    root.querySelector('.screen').innerHTML = `<div class="state-block"><h3>Could not load request</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  const isProvider = state.user.role === 'provider';
  const otherParty = isProvider ? r.customer : r.provider;
  const otherName = isProvider ? otherParty.full_name : (otherParty.business_name || otherParty.full_name);
  const otherUserId = isProvider ? r.customer.id : null; // provider.user id not directly on r.provider; resolved via API when needed

  const actions = (isProvider ? PROVIDER_ACTIONS : CUSTOMER_ACTIONS)[r.status] || [];

  root.querySelector('.screen').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h3>${esc(r.category.icon)} ${esc(r.category.name)}</h3>
          <p class="muted" style="margin-top:4px;">with ${esc(otherName)}</p>
        </div>
        ${statusPill(r.status)}
      </div>
      <div class="divider"></div>
      <p>${esc(r.description)}</p>
      ${r.photos.length ? `<div class="photo-grid">${r.photos.map((p) => `<img src="${esc(p.path)}">`).join('')}</div>` : ''}
      <div class="divider"></div>
      <div class="faint">
        ${r.location ? `📍 ${esc(r.location.area ? r.location.area + ', ' : '')}${esc(r.location.city)}<br>` : ''}
        ${r.addressNote ? `${esc(r.addressNote)}<br>` : ''}
        ${r.preferredDate ? `Preferred: ${esc(r.preferredDate)} ${esc(r.preferredTime || '')}<br>` : ''}
        Urgency: ${esc(r.urgency)}<br>
        ${r.budgetMin || r.budgetMax ? `Budget: ${naira(r.budgetMin)} – ${naira(r.budgetMax)}<br>` : ''}
        Agreed price: ${r.agreedPrice ? naira(r.agreedPrice) : 'Not yet agreed'}
      </div>
    </div>

    <div class="card">
      <h3>Job progress</h3>
      <div style="margin-top:10px;">${jobTimelineHtml(r)}</div>
    </div>

    <div id="action-area"></div>

    <div class="btn-row">
      <button class="btn btn--outline" id="btn-msg">Message ${isProvider ? 'customer' : 'professional'}</button>
      ${!['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status) ? '<button class="btn btn--ghost" id="btn-dispute">Raise a dispute</button>' : ''}
    </div>
  `;

  const actionArea = root.querySelector('#action-area');
  if (actions.length) {
    actionArea.innerHTML = `<div class="card"><div class="btn-row">${actions.map((a) => `<button class="btn ${a.cls}" data-to="${a.to}" data-needs-price="${!!a.needsPrice}">${a.label}</button>`).join('')}</div></div>`;
    actionArea.querySelectorAll('[data-to]').forEach((btn) => {
      btn.addEventListener('click', () => handleStatusChange(r, btn.dataset.to, btn.dataset.needsPrice === 'true'));
    });
  } else if (!isProvider && r.status === 'COMPLETED' && !r.hasReview) {
    actionArea.innerHTML = `<div class="card"><h3>How did it go?</h3><p class="muted" style="margin:6px 0 12px;">Rate your experience — this becomes a verified review.</p><button class="btn btn--gold" id="btn-review">Leave a review</button></div>`;
    actionArea.querySelector('#btn-review').addEventListener('click', () => reviewModal(r));
  } else if (r.hasReview) {
    actionArea.innerHTML = `<div class="info-box">You've already reviewed this job. Thank you!</div>`;
  }

  root.querySelector('#btn-msg').addEventListener('click', async () => {
    // Resolve the other user's id via provider profile lookup when needed
    if (isProvider) {
      navigate(`#/messages/${r.customer.id}`);
    } else {
      try {
        const p = await api.get(`/providers/${r.provider.id}`);
        navigate(`#/messages/${p.userId}`);
      } catch { toast('Could not open chat right now', 'error'); }
    }
  });

  root.querySelector('#btn-dispute')?.addEventListener('click', () => disputeModal(r));
}

async function handleStatusChange(r, to, needsPrice) {
  let agreedPrice;
  if (needsPrice) {
    agreedPrice = prompt('Enter the agreed price in Naira (optional, you can set this later):');
    if (agreedPrice === null) return;
    agreedPrice = agreedPrice ? Number(agreedPrice) : undefined;
  }
  try {
    await api.post(`/requests/${r.id}/status`, { status: to, agreedPrice });
    toast('Updated', 'success');
    navigate(`#/requests/${r.id}`);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function reviewModal(r) {
  const modal = openModal(`
    <h3>Rate this job</h3>
    <div class="field"><label>Overall</label>${starInputHtml('overall')}</div>
    <div class="field"><label>Quality of work</label>${starInputHtml('quality')}</div>
    <div class="field"><label>Professionalism</label>${starInputHtml('professionalism')}</div>
    <div class="field"><label>Communication</label>${starInputHtml('communication')}</div>
    <div class="field"><label>Value for money</label>${starInputHtml('valueForMoney')}</div>
    <div class="field"><label>Punctuality</label>${starInputHtml('punctuality')}</div>
    <div class="field"><label>Written review (optional)</label><textarea id="review-comment" placeholder="Very professional and arrived on time..."></textarea></div>
    <button class="btn btn--primary" id="review-submit">Submit review</button>
  `);
  wireStarInputs(modal);
  modal.querySelector('#review-submit').addEventListener('click', async () => {
    const vals = starInputValues(modal);
    if (Object.values(vals).some((v) => !v)) { toast('Please rate every category', 'error'); return; }
    try {
      await api.post(`/requests/${r.id}/review`, { ...vals, comment: modal.querySelector('#review-comment').value || null });
      closeModal();
      toast('Thanks for your review!', 'success');
      navigate(`#/requests/${r.id}`);
    } catch (e) { toast(e.message, 'error'); }
  });
}

function disputeModal(r) {
  const modal = openModal(`
    <h3>Raise a dispute</h3>
    <div class="field"><label>What went wrong?</label><textarea id="dispute-reason" placeholder="Describe the issue..."></textarea></div>
    <button class="btn btn--danger" id="dispute-submit">Submit dispute</button>
  `);
  modal.querySelector('#dispute-submit').addEventListener('click', async () => {
    const reason = modal.querySelector('#dispute-reason').value.trim();
    if (!reason) { toast('Please describe the issue', 'error'); return; }
    try {
      await api.post(`/requests/${r.id}/dispute`, { reason });
      await api.post(`/requests/${r.id}/status`, { status: 'DISPUTED', note: reason }).catch(() => {});
      closeModal();
      toast('Dispute submitted. Our team will review it.', 'success');
      navigate(`#/requests/${r.id}`);
    } catch (e) { toast(e.message, 'error'); }
  });
}
