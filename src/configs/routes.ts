import { RouteRecordRaw } from "vue-router";

/**
 * 路由列表
 */
export default [
  {
    path: "/",
    component: () => import("../pages/IndexPage.vue"),
    redirect: "/learn",
    props: true,
  },
  {
    path: "/learn/:levelKey?",
    component: () => import("../pages/IndexPage.vue"),
    props: true,
  },
  {
    path: "/levels",
    component: () => import("../pages/LevelsPage.vue"),
  },
  {
    path: "/quiz",
    component: () => import("../pages/QuizPage.vue"),
  },
  {
    path: "/playground",
    component: () => import("../pages/PlaygroundPage.vue"),
  },
] as RouteRecordRaw[];
