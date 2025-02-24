// The URLs you want to redirect from
const blockedUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com", "bilibili.com"];
// The URL you want to redirect to
const destinationUrl = chrome.runtime.getURL('redirect.html');
// 允许访问的路径列表
const allowList = [
  "creator.xiaohongshu.com",
];

// 每个网站的预估平均使用时长（分钟）
const averageTimeSpent = {
  "x.com": 30,
  "youtube.com": 45,
  "twitter.com": 30,
  "xiaohongshu.com": 40,
  "bilibili.com": 45
};

// 生成UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 获取或创建用户ID
async function getUserId() {
  const data = await chrome.storage.local.get(['userId']);
  if (data.userId) {
    return data.userId;
  }
  const newUserId = generateUUID();
  await chrome.storage.local.set({ userId: newUserId });
  return newUserId;
}

// 获取今天的日期字符串 (YYYY-MM-DD)
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// 更新访问统计
async function updateVisitStats(blockedSite) {
  const today = getTodayString();
  const userId = await getUserId();

  // 获取当前统计数据
  const data = await chrome.storage.local.get(['visitStats', 'totalSavedTime']);
  const stats = data.visitStats || {};
  let totalSavedTime = data.totalSavedTime || 0;

  // 初始化今天的统计
  if (!stats[today]) {
    stats[today] = {};
  }
  if (!stats[today][blockedSite]) {
    stats[today][blockedSite] = 0;
  }

  // 增加计数和保存的时间
  stats[today][blockedSite]++;
  totalSavedTime += averageTimeSpent[blockedSite];

  // 保存更新后的统计数据
  await chrome.storage.local.set({
    visitStats: stats,
    totalSavedTime: totalSavedTime
  });

  return {
    todayCount: stats[today][blockedSite],
    totalSavedMinutes: totalSavedTime
  };
}

// 从存储中获取禁用状态
async function getDisableState() {
  const data = await chrome.storage.local.get(['disableEndTime']);

  if (!data.disableEndTime) return { isDisabled: false, endTime: null };

  // 检查是否已过期
  if (Date.now() >= data.disableEndTime) {
    await chrome.storage.local.remove(['disableEndTime']);
    return { isDisabled: false, endTime: null };
  }

  return { isDisabled: true, endTime: data.disableEndTime };
}

// 临时禁用阻止功能
async function temporarilyDisableBlocking(minutes) {
  const endTime = Date.now() + (minutes * 60 * 1000);
  await chrome.storage.local.set({ disableEndTime: endTime });

  // 指定时间后重新启用
  setTimeout(async () => {
    const currentState = await getDisableState();
    if (currentState.endTime === endTime) {
      await chrome.storage.local.remove(['disableEndTime']);
    }
  }, minutes * 60 * 1000);
}

// 检查是否处于禁用状态
async function checkDisableStatus() {
  const state = await getDisableState();
  return state.isDisabled;
}

// 监听导航开始前的事件
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // 只处理主框架的导航
  if (details.frameId !== 0) return;

  // 如果临时禁用了阻止功能，直接返回
  if (await checkDisableStatus()) return;

  // 检查是否在允许列表中
  const isAllowed = allowList.some(allowedPath => details.url.includes(allowedPath));
  if (isAllowed) return;

  // 检查是否需要阻止
  const blockedSite = blockedUrls.find(blockedSite => details.url.includes(blockedSite));
  if (blockedSite) {
    // 更新访问统计
    const stats = await updateVisitStats(blockedSite);

    // 构建重定向URL，包含统计信息
    const redirectUrl = new URL(destinationUrl);
    redirectUrl.searchParams.set('site', blockedSite);
    redirectUrl.searchParams.set('count', stats.todayCount);
    redirectUrl.searchParams.set('savedTime', stats.totalSavedMinutes);
    redirectUrl.searchParams.set('avgTime', averageTimeSpent[blockedSite]);

    // 取消当前导航并重定向到目标URL
    chrome.tabs.update(details.tabId, { url: redirectUrl.toString() });
  }
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(async () => {
  // 确保用户ID存在
  await getUserId();
});

// 监听来自扩展popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'temporarilyDisable') {
    temporarilyDisableBlocking(request.minutes)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 表示我们会异步发送响应
  } else if (request.action === 'getDisableStatus') {
    getDisableState()
      .then(state => {
        const remainingTime = state.endTime ? Math.max(0, Math.floor((state.endTime - Date.now()) / 1000)) : 0;
        sendResponse({
          isDisabled: state.isDisabled,
          remainingSeconds: remainingTime
        });
      })
      .catch(error => sendResponse({ isDisabled: false, remainingSeconds: 0, error: error.message }));
    return true; // 表示我们会异步发送响应
  }
}); 