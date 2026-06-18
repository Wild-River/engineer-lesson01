import { defineConfig } from "vite";

export default defineConfig({
  // ビルド成果物は dist/ に出力（Firebase Hosting の公開先をここに合わせる）
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true, // dev起動時にブラウザを自動で開く
  },
});
