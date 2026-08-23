import { createRouter, createWebHistory } from "vue-router";
import LoginView from "./views/LoginView.vue";
import ServerDetailView from "./views/ServerDetailView.vue";
import ServersView from "./views/ServersView.vue";
import ServersManageView from "./views/ServersManageView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/", component: ServersView },
    { path: "/servers/manage", component: ServersManageView },
    { path: "/servers/:name", component: ServerDetailView },
  ],
});
