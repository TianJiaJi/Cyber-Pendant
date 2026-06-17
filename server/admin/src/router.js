import { createRouter, createWebHashHistory } from 'vue-router';
import { getToken } from './utils/api.js';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import ClothingDetailView from './views/ClothingDetailView.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/dashboard', component: DashboardView },
    { path: '/clothes/:id', component: ClothingDetailView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]
});

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (to.path === '/login' && getToken()) {
    return to.query.redirect || '/dashboard';
  }

  return true;
});

export default router;
