import { bootstrap } from './state.js';
import { addRoute, initRouter } from './router.js';
import { renderHome } from './pages/home.js';
import { renderSearch } from './pages/search.js';
import { renderProvider } from './pages/provider.js';
import { renderAuth } from './pages/auth.js';
import { renderRequests } from './pages/requests.js';
import { renderRequestDetail } from './pages/request-detail.js';
import { renderFavorites } from './pages/favorites.js';
import { renderThreads, renderChat } from './pages/messages.js';
import { renderNotifications } from './pages/notifications.js';
import { renderProfile } from './pages/profile.js';
import {
  renderAdminDashboard, renderAdminVerification, renderAdminUsers, renderAdminReports, renderAdminAudit,
} from './pages/admin.js';

addRoute('/', renderHome);
addRoute('/search', renderSearch);
addRoute('/provider/:id', renderProvider);
addRoute('/login', renderAuth);
addRoute('/requests', renderRequests);
addRoute('/requests/:id', renderRequestDetail);
addRoute('/favorites', renderFavorites);
addRoute('/messages', renderThreads);
addRoute('/messages/:userId', renderChat);
addRoute('/notifications', renderNotifications);
addRoute('/profile', renderProfile);
addRoute('/admin', renderAdminDashboard);
addRoute('/admin/verification', renderAdminVerification);
addRoute('/admin/users', renderAdminUsers);
addRoute('/admin/reports', renderAdminReports);
addRoute('/admin/audit', renderAdminAudit);

const app = document.getElementById('app');
app.innerHTML = `<div class="screen"><div class="state-block"><div class="glyph">🛠️</div><h3>Loading FixNaija…</h3></div></div>`;

bootstrap().then(() => {
  initRouter(app);
});
