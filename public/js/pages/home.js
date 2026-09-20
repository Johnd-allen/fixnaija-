import { api } from '../api.js';
import { state } from '../state.js';
import { renderChrome, providerCardHtml, skeletonCards, emptyState } from '../components.js';
import { navigate } from '../router.js';

const NIGERIAN_CITIES = ['Port Harcourt', 'Lagos', 'Abuja', 'Benin City', 'Warri', 'Owerri', 'Enugu', 'Ibadan', 'Kano'];

export async function renderHome(root) {
  root.innerHTML = `
    <div class="screen">
      <div class="hero">
        <h1>Find a Trusted Professional Near You</h1>
        <p class="sub muted">Verified plumbers, electricians, mechanics and more — across Nigeria.</p>
        <div class="search-card">
          <div class="field">
            <label for="home-search">What service do you need?</label>
            <input id="home-search" type="text" placeholder="e.g. Plumber, Electrician..." />
          </div>
          <div class="field">
            <label for="home-city">Where do you need it?</label>
            <select id="home-city">
              <option value="">Any city</option>
              ${NIGERIAN_CITIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn--primary" id="home-find-btn">Find a Professional</button>
        </div>
      </div>

      <div class="section-head"><h2>Popular categories</h2></div>
      <div class="cat-grid">
        ${state.categories.slice(0, 10).map((c) => `
          <div class="cat-card" data-cat="${c.id}">
            <div class="glyph">${c.icon}</div>
            <div class="label">${c.name}</div>
          </div>`).join('')}
      </div>

      <div class="section-head"><h2>Featured professionals</h2><a href="#/search">See all</a></div>
      <div id="featured-list">${skeletonCards(3)}</div>
    </div>`;

  renderChrome(root, '/');

  root.querySelector('#home-find-btn').addEventListener('click', () => {
    const search = root.querySelector('#home-search').value.trim();
    const city = root.querySelector('#home-city').value;
    navigate(`#/search?search=${encodeURIComponent(search)}&city=${encodeURIComponent(city)}`);
  });
  root.querySelectorAll('.cat-card').forEach((el) => {
    el.addEventListener('click', () => navigate(`#/search?category=${el.dataset.cat}`));
  });

  try {
    const featured = await api.get('/providers?sort=rating');
    const list = root.querySelector('#featured-list');
    if (!list) return; // navigated away
    if (!featured.length) {
      list.innerHTML = emptyState('🧰', 'No professionals yet', 'Be the first to check back soon.');
    } else {
      list.innerHTML = featured.slice(0, 5).map(providerCardHtml).join('');
    }
  } catch {
    const list = root.querySelector('#featured-list');
    if (list) list.innerHTML = emptyState('⚠️', 'Could not load professionals', 'Check your connection and try again.');
  }
}
