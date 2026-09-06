document.addEventListener('DOMContentLoaded', async () => {
  // 控制面板元素
  const disable1MinButton = document.getElementById('disable1MinButton');
  const disable5MinButton = document.getElementById('disable5MinButton');
  const disable1HourButton = document.getElementById('disable1HourButton');
  const countdownElement = document.getElementById('countdown');
  const todayCountElement = document.getElementById('todayCount');
  const settingsBtn = document.getElementById('settingsBtn');

  // 显示版本号
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

  // 获取今日统计
  const today = new Date().toISOString().split('T')[0];
  const data = await chrome.storage.local.get(['visitStats']);
  const stats = data.visitStats || {};
  const todayStats = stats[today] || {};

  // 计算今日总阻止次数
  const todayTotal = Object.values(todayStats).reduce((sum, count) => sum + count, 0);
  todayCountElement.textContent = todayTotal;

  // 检查当前状态并更新UI
  const updateStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDisableStatus' });
      if (response.isDisabled && response.remainingSeconds > 0) {
        // 禁用所有按钮
        disable1MinButton.disabled = true;
        disable5MinButton.disabled = true;
        disable1HourButton.disabled = true;

        // 更新倒计时显示
        const minutes = Math.floor(response.remainingSeconds / 60);
        const seconds = response.remainingSeconds % 60;
        countdownElement.textContent = `解除阻止剩余时间：${minutes}分${seconds}秒`;

        // 继续倒计时
        setTimeout(updateStatus, 1000);
      } else {
        // 启用所有按钮
        disable1MinButton.disabled = false;
        disable5MinButton.disabled = false;
        disable1HourButton.disabled = false;
        countdownElement.textContent = '';
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // 创建禁用功能的通用函数
  const disableForDuration = async (button, minutes) => {
    try {
      await chrome.runtime.sendMessage({ action: 'temporarilyDisable', minutes });
      updateStatus();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // 设置按钮点击事件
  disable1MinButton.addEventListener('click', () => disableForDuration(disable1MinButton, 1));
  disable5MinButton.addEventListener('click', () => disableForDuration(disable5MinButton, 5));
  disable1HourButton.addEventListener('click', () => disableForDuration(disable1HourButton, 60));

  // 设置按钮点击事件
  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  // 初始化时检查状态
  await updateStatus();
});