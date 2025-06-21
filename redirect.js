// 获取URL参数
const params = new URLSearchParams(window.location.search);
const site = params.get('site');
const count = parseInt(params.get('count')) || 0;
const savedTime = parseInt(params.get('savedTime')) || 0;
const avgTime = parseInt(params.get('avgTime')) || 30;

// 加载自定义提示语
async function loadCustomMessage() {
  try {
    const data = await chrome.storage.local.get(['customMessage']);
    const customMessage = data.customMessage || '保持专注';
    document.querySelector('h1').textContent = customMessage;
  } catch (error) {
    console.error('加载自定义提示语失败:', error);
    document.querySelector('h1').textContent = '保持专注';
  }
}

// 更新统计数据
function updateStats() {
  document.getElementById('todayCount').textContent = count;
  document.getElementById('savedTime').textContent = (savedTime / 60).toFixed(1);
  document.getElementById('siteName').textContent = site;
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async function () {
  await loadCustomMessage();
  updateStats();
}); 