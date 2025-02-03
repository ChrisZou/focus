document.addEventListener('DOMContentLoaded', () => {
  const disableButton = document.getElementById('disableButton');

  // 点击按钮时发送消息到background脚本
  disableButton.addEventListener('click', async () => {
    disableButton.disabled = true;

    try {
      await chrome.runtime.sendMessage({ action: 'temporarilyDisable' });

      // 显示倒计时
      let secondsLeft = 60;
      const intervalId = setInterval(() => {
        secondsLeft--;
        disableButton.textContent = `还剩 ${secondsLeft} 秒`;

        if (secondsLeft <= 0) {
          clearInterval(intervalId);
          disableButton.textContent = '暂停阻止1分钟';
          disableButton.disabled = false;
        }
      }, 1000);
    } catch (error) {
      console.error('Error:', error);
      disableButton.disabled = false;
    }
  });
}); 