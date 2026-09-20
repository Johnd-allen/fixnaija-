import { api, fileToBase64 } from '../api.js';
import { state } from '../state.js';
import { renderChrome, esc, timeAgo, emptyState, skeletonCards, requireLogin, toast } from '../components.js';

export async function renderThreads(root) {
  if (!requireLogin()) return;
  root.innerHTML = `<div class="screen"><h2>Messages</h2><div id="thread-list" style="margin-top:12px;">${skeletonCards(4)}</div></div>`;
  renderChrome(root, '/messages');
  try {
    const rows = await api.get('/messages/threads');
    const list = root.querySelector('#thread-list');
    list.innerHTML = rows.length ? rows.map((t) => `
      <div class="list-row" data-goto="#/messages/${t.userId}">
        <div class="list-row__avatar">${esc((t.name || '?')[0].toUpperCase())}</div>
        <div class="list-row__body">
          <b>${esc(t.name)}</b>
          <p>${esc(t.lastMessage)}</p>
        </div>
        <div style="text-align:right;">
          <div class="faint">${timeAgo(t.lastAt)}</div>
          ${t.unread ? `<div class="unread-dot" style="margin-left:auto;margin-top:4px;"></div>` : ''}
        </div>
      </div>`).join('') : emptyState('💬', 'No conversations yet', 'Messages with customers and professionals will appear here.');
  } catch (e) {
    root.querySelector('#thread-list').innerHTML = emptyState('⚠️', 'Could not load messages', e.message);
  }
}

export async function renderChat(root, params) {
  if (!requireLogin()) return;
  root.innerHTML = `
    <div class="screen">
      <div id="chat-log" class="chat-log"><div class="skeleton" style="height:300px;"></div></div>
    </div>
    <div class="chat-input-bar">
      <label class="icon-btn" style="background:var(--surface-sunk);color:var(--ink-soft);cursor:pointer;">
        📎<input type="file" id="chat-file" accept="image/*" style="display:none;">
      </label>
      <input type="text" id="chat-text" placeholder="Type a message..." />
      <button id="chat-send">➤</button>
    </div>`;
  renderChrome(root, '/messages');

  async function load() {
    try {
      const [messages, threads] = await Promise.all([
        api.get(`/messages/thread/${params.userId}`),
        api.get('/messages/threads'),
      ]);
      const logEl = root.querySelector('#chat-log');
      if (!logEl) return;
      logEl.innerHTML = messages.length ? messages.map((m) => `
        <div class="msg ${m.sender_id === state.user.id ? 'me' : 'them'}">
          ${m.body ? esc(m.body) : ''}
          ${m.image_path ? `<img src="${esc(m.image_path)}">` : ''}
        </div>`).join('') : `<div class="state-block"><div class="glyph">👋</div><p>Say hello to start the conversation.</p></div>`;
      logEl.scrollTop = logEl.scrollHeight;
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function send() {
    const textEl = root.querySelector('#chat-text');
    const fileEl = root.querySelector('#chat-file');
    const body = textEl.value.trim();
    const file = fileEl.files[0];
    if (!body && !file) return;
    let imageBase64;
    if (file) imageBase64 = await fileToBase64(file);
    textEl.value = '';
    fileEl.value = '';
    try {
      await api.post('/messages', { recipientId: params.userId, body: body || undefined, imageBase64 });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  root.querySelector('#chat-send').addEventListener('click', send);
  root.querySelector('#chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  root.querySelector('#chat-file').addEventListener('change', () => toast('Photo attached — tap send', 'success'));

  load();
  const poll = setInterval(() => { if (root.querySelector('#chat-log')) load(); else clearInterval(poll); }, 5000);
}
