import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 開発時の proxy 先（各 Functions の Cloud Run URL）。.env に設定。
  const diagnoseOrigin = env.VITE_FUNCTIONS_ORIGIN || "";          // パーソナルカラー
  const skeletonOrigin = env.VITE_SKELETON_ORIGIN || "";           // 骨格診断

  const proxy = {};
  // より長いパス（/api/diagnose-skeleton）を先に登録する。
  // Viteのproxyは前方一致のため、/api/diagnose を先に置くと skeleton 側にも
  // 誤マッチしてしまう。長い方を先に書くことで正しく振り分ける。
  if (skeletonOrigin) {
    proxy["/api/diagnose-skeleton"] = {
      target: skeletonOrigin,
      changeOrigin: true,
      rewrite: () => "/",
    };
  }
  if (diagnoseOrigin) {
    proxy["/api/diagnose"] = {
      target: diagnoseOrigin,
      changeOrigin: true,
      rewrite: () => "/",
    };
  }

  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      open: true,
      proxy: Object.keys(proxy).length ? proxy : undefined,
    },
  };
});