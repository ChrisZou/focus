// The URLs you want to redirect from
const blockedUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com", "bilibili.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";
// 允许访问的路径列表
const allowList = [
  "xiaohongshu.com/zhibo/obs",
  "creator.xiaohongshu.com",
];

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

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 如果临时禁用了阻止功能，直接返回
  if (await checkDisableStatus()) return;

  // 检查是否在允许列表中
  const isAllowed = allowList.some(allowedPath => tab.url.includes(allowedPath));
  if (isAllowed) return;

  // 检查是否需要阻止
  const shouldBlock = blockedUrls.some(blockedSite => tab.url.includes(blockedSite));
  if (shouldBlock) {
    chrome.tabs.update(tabId, { url: destinationUrl });
  }
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