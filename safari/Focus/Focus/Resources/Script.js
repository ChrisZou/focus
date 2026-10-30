function show(enabled) {
    document.getElementById('status').textContent = enabled
        ? '扩展已启用 · 请确认已允许访问所有网站'
        : '请在 Safari 中启用扩展并允许访问所有网站';
}

function showSettingsError() {
    document.getElementById('status').textContent = '请手动打开 Safari → 设置 → 扩展';
}

document.getElementById('openSettings').addEventListener('click', () => {
    webkit.messageHandlers.controller.postMessage('open-preferences');
});
