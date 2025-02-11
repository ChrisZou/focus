document.addEventListener('DOMContentLoaded', () => {
  const disable1MinButton = document.getElementById('disable1MinButton');
  const disable5MinButton = document.getElementById('disable5MinButton');

  // 创建禁用功能的通用函数
  const disableForDuration = async (button, minutes) => {
    // 禁用两个按钮
    disable1MinButton.disabled = true;
    disable5MinButton.disabled = true;

    try {
      await chrome.runtime.sendMessage({ action: 'temporarilyDisable', minutes });

      // 显示倒计时
      let secondsLeft = minutes * 60;
      const intervalId = setInterval(() => {
        secondsLeft--;
        const minutesLeft = Math.floor(secondsLeft / 60);
        const secondsLeftInMinute = secondsLeft % 60;

        // 更新当前点击的按钮文字
        button.textContent = `还剩 ${minutesLeft}分${secondsLeftInMinute}秒`;

        if (secondsLeft <= 0) {
          clearInterval(intervalId);
          // 重置两个按钮
          disable1MinButton.textContent = '暂停阻止1分钟';
          disable5MinButton.textContent = '暂停阻止5分钟';
          disable1MinButton.disabled = false;
          disable5MinButton.disabled = false;
        }
      }, 1000);
    } catch (error) {
      console.error('Error:', error);
      // 发生错误时启用两个按钮
      disable1MinButton.disabled = false;
      disable5MinButton.disabled = false;
    }
  };

  // 设置按钮点击事件
  disable1MinButton.addEventListener('click', () => disableForDuration(disable1MinButton, 1));
  disable5MinButton.addEventListener('click', () => disableForDuration(disable5MinButton, 5));
}); 