// 土台確認用。これが画面に出れば Vite + モジュール読み込みが動いている。
const app = document.getElementById("app");
app.innerHTML = `
  <div style="font-family: system-ui, sans-serif; padding: 40px; text-align: center;">
    <h1 style="font-size: 22px;">セットアップ成功 🎉</h1>
    <p style="color: #666;">Vite の開発サーバーが動いています。<br>次のステップでホワイトバランス補正を組み込みます。</p>
  </div>
`;

// Functions の URL が .env から読めているか確認（コンソールに出力）
const fnUrl = import.meta.env.VITE_DIAGNOSE_URL;
console.log("VITE_DIAGNOSE_URL =", fnUrl || "(未設定)");
