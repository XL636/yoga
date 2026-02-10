import { createRouter, createWebHistory } from 'vue-router'
import Templates from './pages/Templates.vue'
import Sessions from './pages/Sessions.vue'
import SessionBookings from './pages/SessionBookings.vue'

const routes = [
  { path: '/', redirect: '/templates' },
  { path: '/templates', component: Templates },
  { path: '/sessions', component: Sessions },
  { path: '/sessions/:id/bookings', component: SessionBookings, props: true },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
