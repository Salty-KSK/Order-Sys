// PWAとして認識されるための最小限のService Worker
// ※完全キャッシュすると社内アップデートが反映されなくなるため、常にネットワークから最新を取る「パススルー仕様」にしています

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    // 基本的にネットワーク（最新のファイル）から取得する
    e.respondWith(
        fetch(e.request).catch(() => {
            // オフラインの際はブラウザの標準エラー処理に任せる（今回はオンライン必須アプリのため）
            return new Response('現在はオフラインです。インターネットに接続してください。');
        })
    );
});
