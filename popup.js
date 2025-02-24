document.addEventListener('DOMContentLoaded', async () => {
  const disable1MinButton = document.getElementById('disable1MinButton');
  const disable5MinButton = document.getElementById('disable5MinButton');
  const disable1HourButton = document.getElementById('disable1HourButton');

  // 检查当前状态并更新UI
  const updateStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDisableStatus' });
      if (response.isDisabled && response.remainingSeconds > 0) {
        // 禁用所有按钮
        disable1MinButton.disabled = true;
        disable5MinButton.disabled = true;
        disable1HourButton.disabled = true;

        // 计算剩余时间
        const hoursLeft = Math.floor(response.remainingSeconds / 3600);
        const minutesLeft = Math.floor((response.remainingSeconds % 3600) / 60);
        const secondsLeft = response.remainingSeconds % 60;

        // 更新对应按钮的文字
        let targetButton;
        if (hoursLeft > 0) {
          targetButton = disable1HourButton;
        } else if (minutesLeft >= 5) {
          targetButton = disable5MinButton;
        } else {
          targetButton = disable1MinButton;
        }

        // 格式化显示时间
        let timeText = '';
        if (hoursLeft > 0) {
          timeText = `还剩 ${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`;
        } else {
          timeText = `还剩 ${minutesLeft}分${secondsLeft}秒`;
        }
        targetButton.textContent = timeText;

        // 继续倒计时
        startCountdown(targetButton, response.remainingSeconds);
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  // 创建倒计时函数
  const startCountdown = (button, totalSeconds) => {
    let secondsLeft = totalSeconds;
    const intervalId = setInterval(() => {
      secondsLeft--;
      const hoursLeft = Math.floor(secondsLeft / 3600);
      const minutesLeft = Math.floor((secondsLeft % 3600) / 60);
      const secondsLeftInMinute = secondsLeft % 60;

      // 更新当前点击的按钮文字
      let timeText = '';
      if (hoursLeft > 0) {
        timeText = `还剩 ${hoursLeft}小时${minutesLeft}分${secondsLeftInMinute}秒`;
      } else {
        timeText = `还剩 ${minutesLeft}分${secondsLeftInMinute}秒`;
      }
      button.textContent = timeText;

      if (secondsLeft <= 0) {
        clearInterval(intervalId);
        // 重置所有按钮
        disable1MinButton.textContent = '暂停阻止1分钟';
        disable5MinButton.textContent = '暂停阻止5分钟';
        disable1HourButton.textContent = '暂停阻止1小时';
        disable1MinButton.disabled = false;
        disable5MinButton.disabled = false;
        disable1HourButton.disabled = false;
      }
    }, 1000);
  };

  // 创建禁用功能的通用函数
  const disableForDuration = async (button, minutes) => {
    // 禁用所有按钮
    disable1MinButton.disabled = true;
    disable5MinButton.disabled = true;
    disable1HourButton.disabled = true;

    try {
      await chrome.runtime.sendMessage({ action: 'temporarilyDisable', minutes });
      startCountdown(button, minutes * 60);
    } catch (error) {
      console.error('Error:', error);
      // 发生错误时启用所有按钮
      disable1MinButton.disabled = false;
      disable5MinButton.disabled = false;
      disable1HourButton.disabled = false;
    }
  };

  // 设置按钮点击事件
  disable1MinButton.addEventListener('click', () => disableForDuration(disable1MinButton, 1));
  disable5MinButton.addEventListener('click', () => disableForDuration(disable5MinButton, 5));
  disable1HourButton.addEventListener('click', () => disableForDuration(disable1HourButton, 60)); // 60分钟 = 1小时

  // 初始化时检查状态
  await updateStatus();
});