const params = new URLSearchParams(window.location.search);
const site = params.get('site') || '';
const domain = params.get('domain') || '';
const count = parseInt(params.get('count'), 10) || 0;

async function loadCustomMessage() {
  try {
    const data = await chrome.storage.local.get(['customMessage', 'messageSource', 'messageAvatar']);
    document.querySelector('h1').textContent = data.customMessage || '保持专注';
    const source = (data.messageSource || '').trim();
    const avatar = (data.messageAvatar || '').trim();
    const sourceEl = document.getElementById('messageSource');
    const nameEl = document.getElementById('sourceName');
    if (source) {
      nameEl.textContent = source;
      nameEl.hidden = false;
      sourceEl.hidden = false;
    }
    if (avatar) {
      const avatarEl = document.getElementById('sourceAvatar');
      avatarEl.alt = source ? `${source}的头像` : '来源头像';
      avatarEl.onload = () => {
        avatarEl.hidden = false;
        sourceEl.hidden = false;
      };
      avatarEl.onerror = () => {
        avatarEl.hidden = true;
        sourceEl.hidden = !source;
      };
      avatarEl.src = avatar;
    }
  } catch (error) {
    console.error('加载自定义提示语失败:', error);
  }
}

function updateStats() {
  document.getElementById('todayCount').textContent = `${count} 次`;
  document.getElementById('siteName').textContent = domain;
  document.getElementById('attemptedSite').hidden = !domain;
  document.getElementById('siteStats').textContent = `今日已阻止访问${domain || site ? ` · ${domain || site}` : ''}`;
  const dailyLimit = parseInt(params.get('dailyLimit'), 10) || 0;
  if (dailyLimit > 0) {
    const notice = document.getElementById('limitNotice');
    notice.textContent = `今日 ${domain || site} 的 ${dailyLimit} 次访问额度已用完，明天再来吧`;
    notice.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateStats();
  loadCustomMessage();
});
