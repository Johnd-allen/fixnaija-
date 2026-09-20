import { api } from '../api.js';
import { state } from '../state.js';
import {
  renderChrome, esc, naira, starsDisplay, verifiedBadge, availabilityPill,
  ratingDistributionHtml, emptyState, openModal, closeModal, toast, requireLogin,
} from '../components.js';
import { navigate } from '../router.js';

export async function renderProvider(root, params) {
  root.innerHTML = `<div class="screen"><div class="skeleton" style="height:180px;margin-bottom:16px;"></div></div>`;
  renderChrome(root, '/search');

  let provider, reviewsData;
  try {
    [provider, reviewsData] = await Promise.all([
      api.get(`/providers/${params.id}`),
      api.get(`/providers/${params.id}/reviews`),
    ]);
  } catch (e) {
    root.querySelector('.screen').innerHTML = emptyState('⚠️', 'Provider not found', e.message);
    return;
  }

  const photo = provider.profilePhoto ? `<img src="${esc(provider.profilePhoto)}" alt="">` : (provider.categories[0]?.icon || '🛠️');
  const loc = provider.location ? `${provider.location.area ? provider.location.area + ', ' : ''}${provider.location.city}, ${provider.location.state}` : 'Location not set';

  root.querySelector('.screen').innerHTML = `
    <div class="profile-hero">
      <div class="profile-hero__top">
        <div class="profile-hero__photo">${photo}</div>
        <div>
          <h2>${esc(provider.name)}</h2>
          <div class="meta">${esc((provider.categories || []).map((c) => c.name).join(', '))}</div>
          <div class="meta">${esc(loc)}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${verifiedBadge(provider.verificationStatus)}${availabilityPill(provider.availability)}</div>
        </div>
      </div>
      <div class="profile-hero__stats">
        <div><b>${provider.avgRating ? provider.avgRating.toFixed(1) : '—'}★</b><span>${provider.reviewCount} reviews</span></div>
        <div><b>${provider.completedJobs}</b><span>jobs done</span></div>
        <div><b>${provider.yearsExperience}</b><span>years exp.</span></div>
        <div><b>${naira(provider.startingPrice)}</b><span>starting price</span></div>
      </div>
    </div>

    <div class="btn-row" style="margin-bottom:14px;">
      <button class="btn btn--primary" id="btn-request">Request Service</button>
      <button class="btn btn--outline" id="btn-message">Message</button>
    </div>
    <div class="btn-row" style="margin-bottom:14px;">
      ${provider.phone ? `<a class="btn btn--gold" href="tel:${provider.phone}">Call</a>` : ''}
      <button class="btn btn--ghost" id="btn-favorite">☆ Save</button>
    </div>

    <div class="warning-box">FixNaija does not currently process or hold payments. Agree on the price with the professional directly, and avoid sending money before work begins.</div>

    ${provider.bio ? `<div class="card"><h3>About</h3><p style="margin-top:8px;">${esc(provider.bio)}</p></div>` : ''}

    ${provider.portfolio.length ? `<div class="card"><h3>Portfolio</h3><div class="photo-grid">${provider.portfolio.map((p) => `<img src="${esc(p.path)}" alt="">`).join('')}</div></div>` : ''}

    <div class="card">
      <h3>Ratings &amp; reviews</h3>
      <div class="rating-line" style="margin:10px 0;">${starsDisplay(provider.avgRating)} <b>${provider.avgRating ? provider.avgRating.toFixed(1) : '0.0'}</b><span class="muted">Based on ${provider.reviewCount} verified reviews</span></div>
      ${ratingDistributionHtml(reviewsData.distribution, provider.reviewCount)}
      <div class="divider"></div>
      <div id="reviews-list"></div>
    </div>
  `;

  const reviewsList = root.querySelector('#reviews-list');
  reviewsList.innerHTML = reviewsData.reviews.length
    ? reviewsData.reviews.map((r) => `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <b>${esc(r.customer_name)}</b>
          <span class="faint">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div style="margin:4px 0;">${starsDisplay(r.overall)} <span class="badge-verified" style="margin-left:6px;">Verified Job</span></div>
        ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
        ${r.provider_reply ? `<div style="background:var(--surface-sunk);border-radius:10px;padding:10px;margin-top:8px;font-size:0.85rem;"><b>Response from ${esc(provider.name)}:</b> ${esc(r.provider_reply)}</div>` : ''}
        <button class="btn btn--ghost btn--sm" data-report-review="${r.id}" style="margin-top:4px;">Report review</button>
      </div>
    `).join('')
    : emptyState('⭐', 'No reviews yet', 'Be the first to complete a job and leave a review.');

  reviewsList.querySelectorAll('[data-report-review]').forEach((btn) => {
    btn.addEventListener('click', () => reportReviewModal(btn.dataset.reportReview));
  });

  root.querySelector('#btn-request').addEventListener('click', () => {
    if (!requireLogin('customer')) return;
    requestServiceModal(provider);
  });
  root.querySelector('#btn-message').addEventListener('click', () => {
    if (!requireLogin()) return;
    navigate(`#/messages/${provider.userId}`);
  });
  root.querySelector('#btn-favorite').addEventListener('click', async (e) => {
    if (!requireLogin('customer')) return;
    try {
      await api.post(`/favorites/${provider.id}`);
      e.target.textContent = '★ Saved';
      toast('Saved to favorites', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function requestServiceModal(provider) {
  const modal = openModal(`
    <h3>Request ${esc(provider.name)}</h3>
    <div class="field">
      <label>Service category</label>
      <select id="req-cat">${provider.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Describe the problem</label>
      <textarea id="req-desc" placeholder="e.g. Kitchen pipe is leaking heavily"></textarea>
    </div>
    <div class="row-2">
      <div class="field"><label>Preferred date</label><input type="date" id="req-date" /></div>
      <div class="field"><label>Preferred time</label><input type="time" id="req-time" /></div>
    </div>
    <div class="field">
      <label>Urgency</label>
      <select id="req-urgency">
        <option value="NORMAL">Normal</option>
        <option value="URGENT">Urgent</option>
        <option value="EMERGENCY">Emergency</option>
        <option value="LOW">Low priority</option>
      </select>
    </div>
    <div class="row-2">
      <div class="field"><label>Budget min (₦)</label><input type="number" id="req-budget-min" /></div>
      <div class="field"><label>Budget max (₦)</label><input type="number" id="req-budget-max" /></div>
    </div>
    <div class="field">
      <label>Address / area note</label>
      <input type="text" id="req-address" placeholder="e.g. Rumuodara, Port Harcourt" />
    </div>
    <button class="btn btn--primary" id="req-submit">Send Request</button>
  `);
  modal.querySelector('#req-submit').addEventListener('click', async () => {
    const description = modal.querySelector('#req-desc').value.trim();
    if (!description) { toast('Please describe the problem', 'error'); return; }
    const btn = modal.querySelector('#req-submit');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await api.post('/requests', {
        providerId: provider.id,
        categoryId: modal.querySelector('#req-cat').value,
        description,
        preferredDate: modal.querySelector('#req-date').value || null,
        preferredTime: modal.querySelector('#req-time').value || null,
        urgency: modal.querySelector('#req-urgency').value,
        budgetMin: Number(modal.querySelector('#req-budget-min').value) || null,
        budgetMax: Number(modal.querySelector('#req-budget-max').value) || null,
        addressNote: modal.querySelector('#req-address').value || null,
      });
      closeModal();
      toast('Request sent!', 'success');
      navigate('#/requests');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Send Request';
      toast(e.message, 'error');
    }
  });
}

function reportReviewModal(reviewId) {
  if (!requireLogin()) return;
  const modal = openModal(`
    <h3>Report this review</h3>
    <div class="field">
      <label>Reason</label>
      <textarea id="report-reason" placeholder="Why does this review seem fake or inappropriate?"></textarea>
    </div>
    <button class="btn btn--danger" id="report-submit">Submit report</button>
  `);
  modal.querySelector('#report-submit').addEventListener('click', async () => {
    try {
      await api.post(`/reviews/${reviewId}/report`, { reason: modal.querySelector('#report-reason').value || 'Not specified' });
      closeModal();
      toast('Report submitted. Our team will review it.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}
