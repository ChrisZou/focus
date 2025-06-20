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

// // 显示随机名言
// function displayQuote() {
//   const quotes = [
//     '"专注是天才和卓越的共同特征。" —— 爱默生',
//     '"把时间用在准备上的人，他的成功不是偶然。" —— 比尔·盖茨',
//     '"注意力是一种有限的资源，要像管理金钱一样管理它。" —— 大卫·艾伦',
//     '"成功的秘诀在于全神贯注。" —— 爱因斯坦',
//     '"把注意力集中在重要的事情上，而不是紧急的事情上。" —— 史蒂芬·柯维'
//   ];
//   document.getElementById('quote').textContent = quotes[Math.floor(Math.random() * quotes.length)];
// }

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async function () {
  await loadCustomMessage();
  updateStats();
  // displayQuote();
}); 