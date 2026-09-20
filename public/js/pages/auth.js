import { api } from '../api.js';
import { refreshMe } from '../state.js';
import { toast } from '../components.js';
import { navigate } from '../router.js';

export async function renderAuth(root, params, query) {
  let mode = query.mode === 'register' ? 'register' : 'login';
  let role = query.role === 'provider' ? 'provider' : 'customer';

  function draw() {
    root.innerHTML = `
      <div class="auth-wrap">
        <div style="text-align:center;margin-bottom:22px;">
          <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;color:var(--green-deep);">FixNaija</div>
          <p class="muted">Find a trusted professional near you</p>
        </div>
        <div class="auth-toggle">
          <button data-mode="login" class="${mode === 'login' ? 'active' : ''}">Log in</button>
          <button data-mode="register" class="${mode === 'register' ? 'active' : ''}">Create account</button>
        </div>

        ${mode === 'register' ? `
          <div class="chip-select" style="margin-bottom:16px;">
            <div class="chip role-chip ${role === 'customer' ? 'active' : ''}" data-role="customer">I need a service</div>
            <div class="chip role-chip ${role === 'provider' ? 'active' : ''}" data-role="provider">I offer a service</div>
          </div>
          <div class="field"><label>Full name</label><input id="a-name" type="text" placeholder="Your full name" /></div>
          <div class="field"><label>Phone number</label><input id="a-phone" type="tel" placeholder="+2348012345678" /></div>
          <div class="field"><label>Email (optional)</label><input id="a-email" type="email" placeholder="you@example.com" /></div>
          <div class="field"><label>Password</label><input id="a-password" type="password" placeholder="At least 6 characters" /></div>
          <button class="btn btn--primary" id="a-submit">Create account</button>
        ` : `
          <div class="field"><label>Phone or email</label><input id="a-identifier" type="text" placeholder="+2348012345678" /></div>
          <div class="field"><label>Password</label><input id="a-password" type="password" placeholder="Your password" /></div>
          <button class="btn btn--primary" id="a-submit">Log in</button>
        `}
        <p class="faint" style="text-align:center;margin-top:16px;">By continuing you agree to use FixNaija responsibly and provide accurate information.</p>
      </div>`;

    root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => { mode = btn.dataset.mode; draw(); });
    });
    root.querySelectorAll('[data-role]').forEach((btn) => {
      btn.addEventListener('click', () => { role = btn.dataset.role; draw(); });
    });

    root.querySelector('#a-submit').addEventListener('click', async () => {
      const btn = root.querySelector('#a-submit');
      btn.disabled = true;
      try {
        if (mode === 'register') {
          const full_name = root.querySelector('#a-name').value.trim();
          const phone = root.querySelector('#a-phone').value.trim();
          const email = root.querySelector('#a-email').value.trim();
          const password = root.querySelector('#a-password').value;
          if (!full_name || !phone || !password) throw new Error('Please fill in all required fields');
          await api.post('/auth/register', { full_name, phone, email, password, role });
        } else {
          const identifier = root.querySelector('#a-identifier').value.trim();
          const password = root.querySelector('#a-password').value;
          if (!identifier || !password) throw new Error('Please enter your phone/email and password');
          await api.post('/auth/login', { identifier, password });
        }
        await refreshMe();
        toast(mode === 'register' ? 'Welcome to FixNaija!' : 'Welcome back!', 'success');
        navigate('#/');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  draw();
}
