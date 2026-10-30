document.addEventListener('DOMContentLoaded', async () => {
  const todayCountElement = document.getElementById('todayCount');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  // 显示版本号
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

  // 获取今日统计
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const data = await chrome.storage.local.get(['visitStats']);
  const stats = data.visitStats || {};
  const todayStats = stats[today] || {};

  // 计算今日总阻止次数
  const todayTotal = Object.values(todayStats).reduce((sum, count) => sum + count, 0);
  todayCountElement.textContent = todayTotal;

  // 显示每日访问限额剩余次数
  try {
    const limitResponse = await chrome.runtime.sendMessage({ action: 'getDailyVisitInfo' });
    const limited = (limitResponse && limitResponse.success)
      ? limitResponse.info.filter(item => item.dailyLimit)
      : [];
    const limitsEl = document.getElementById('dailyLimits');
    if (limited.length > 0) {
      limitsEl.innerHTML = '<h2 class="h3">今日剩余访问次数</h2>';
      limited.forEach(item => {
        const remaining = Math.max(0, item.dailyLimit - item.used);
        const row = document.createElement('div');
        row.className = 'row';
        const nameEl = document.createElement('span');
        nameEl.textContent = item.name;
        const valueEl = document.createElement('b');
        valueEl.className = remaining === 0 ? 'x' : '';
        valueEl.textContent = `${remaining} / ${item.dailyLimit}${remaining === 0 ? ' 已用完' : ''}`;
        row.appendChild(nameEl);
        row.appendChild(valueEl);
        limitsEl.appendChild(row);
      });
      limitsEl.hidden = false;
    }
  } catch (error) {
    console.error('加载每日限额失败:', error);
  }

});
