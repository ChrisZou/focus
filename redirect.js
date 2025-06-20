// 获取URL参数
const params = new URLSearchParams(window.location.search);
const site = params.get('site');
const count = parseInt(params.get('count')) || 0;
const savedTime = parseInt(params.get('savedTime')) || 0;
const avgTime = parseInt(params.get('avgTime')) || 30;

// 更新统计数据
document.getElementById('todayCount').textContent = count;
document.getElementById('savedTime').textContent = (savedTime / 60).toFixed(1);
document.getElementById('siteName').textContent = site;

// 随机名言
const quotes = [
  '"专注是天才和卓越的共同特征。" —— 爱默生',
  '"把时间用在准备上的人，他的成功不是偶然。" —— 比尔·盖茨',
  '"注意力是一种有限的资源，要像管理金钱一样管理它。" —— 大卫·艾伦',
  '"成功的秘诀在于全神贯注。" —— 爱因斯坦',
  '"把注意力集中在重要的事情上，而不是紧急的事情上。" —— 史蒂芬·柯维'
];
document.getElementById('quote').textContent = quotes[Math.floor(Math.random() * quotes.length)]; 