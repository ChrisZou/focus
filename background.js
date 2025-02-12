// The URLs you want to redirect from
const blockedUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";
// 允许访问的路径列表
const allowList = [
  "xiaohongshu.com/zhibo/obs",
  "creator.xiaohongshu.com",
];

// 临时禁用状态和结束时间
let isTemporarilyDisabled = false;
let disableEndTime = null;

// 临时禁用阻止功能
function temporarilyDisableBlocking(minutes) {
  isTemporarilyDisabled = true;
  // 设置结束时间戳
  disableEndTime = Date.now() + (minutes * 60 * 1000);

  // 指定时间后重新启用
  setTimeout(() => {
    isTemporarilyDisabled = false;
    disableEndTime = null;
  }, minutes * 60 * 1000);
}

// 检查是否处于禁用状态
function checkDisableStatus() {
  if (!isTemporarilyDisabled) return false;
  if (Date.now() >= disableEndTime) {
    isTemporarilyDisabled = false;
    disableEndTime = null;
    return false;
  }
  return true;
}

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 如果临时禁用了阻止功能，直接返回
  if (checkDisableStatus()) return;

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
    temporarilyDisableBlocking(request.minutes);
    sendResponse({ success: true });
  } else if (request.action === 'getDisableStatus') {
    // 返回当前禁用状态和剩余时间
    const remainingTime = disableEndTime ? Math.max(0, Math.floor((disableEndTime - Date.now()) / 1000)) : 0;
    sendResponse({
      isDisabled: checkDisableStatus(),
      remainingSeconds: remainingTime
    });
  }
}); 