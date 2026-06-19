import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 開発時の /api proxy 先（Functions の Cloud Run URL）。.env の VITE_FUNCTIONS_ORIGIN に設定。
  const functionsOrigin = env.VITE_FUNCTIONS_ORIGIN || "";

  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      open: true,
      proxy: functionsOrigin
        ? {
          // 開発中: /api/diagnose → Cloud Run関数のルート(/)に転送
          // .run.app 形式はURL自体がエンドポイントなので、パスは / に書き換える
          "/api/diagnose": {
            target: functionsOrigin,
            changeOrigin: true,
            rewrite: () => "/",
          },
        }
        : undefined,
    },
  };
});