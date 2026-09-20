import { api } from './api.js';

const listeners = new Set();

export const state = {
  user: null,
  providerId: null,
  categories: [],
  unreadNotifications: 0,
  ready: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { listeners.forEach((fn) => fn()); }

export async function bootstrap() {
  try {
    const cats = await api.get('/categories');
    state.categories = cats;
  } catch { /* non-fatal */ }
  await refreshMe();
  state.ready = true;
  emit();
}

export async function refreshMe() {
  try {
    const { user, providerId } = await api.get('/auth/me');
    state.user = user;
    state.providerId = providerId;
  } catch {
    state.user = null;
    state.providerId = null;
  }
  refreshNotificationCount();
  emit();
}

export async function refreshNotificationCount() {
  if (!state.user) { state.unreadNotifications = 0; emit(); return; }
  try {
    const rows = await api.get('/notifications');
    state.unreadNotifications = rows.filter((n) => !n.read_at).length;
  } catch { /* ignore */ }
  emit();
}

export async function logout() {
  await api.post('/auth/logout');
  state.user = null;
  state.providerId = null;
  emit();
}

export function categoryName(id) {
  const c = state.categories.find((c) => c.id === id);
  return c ? c.name : '';
}
