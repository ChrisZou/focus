// 获取URL参数
const params = new URLSearchParams(window.location.search);
const site = params.get('site') || '';
const domain = params.get('domain') || '';
const target = params.get('target') || '';
const dailyLimit = parseInt(params.get('dailyLimit')) || 0;
const dailyUsed = parseInt(params.get('dailyUsed')) || 0;

// 显示剩余次数
function render() {
  const remaining = Math.max(0, dailyLimit - dailyUsed);
  document.getElementById('remainingText').textContent = `今天还剩 ${remaining} 次`;
  document.getElementById('siteName').textContent = site;
  document.getElementById('usedCount').textContent = `${dailyUsed} / ${dailyLimit}`;
}

// 点击确认：交给后台计数并放行
async function confirmVisit() {
  const btn = document.getElementById('confirmBtn');
  const errorEl = document.getElementById('errorText');
  btn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'confirmVisit', domain, target });
    if (response && response.success) return; // 后台会将当前标签页跳转到目标网站
    errorEl.textContent = (response && response.error) || '确认失败，请重试';
    errorEl.style.display = 'block';
    if (!(response && response.exhausted)) btn.disabled = false;
  } catch (error) {
    console.error('确认访问失败:', error);
    errorEl.textContent = '确认失败，请重试';
    errorEl.style.display = 'block';
    btn.disabled = false;
  }
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
  render();
  document.getElementById('confirmBtn').addEventListener('click', confirmVisit);
});
