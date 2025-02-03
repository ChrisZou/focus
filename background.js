// The URLs you want to redirect from
const blockedUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";
// 允许访问的路径列表
const allowList = [
  "xiaohongshu.com/zhibo/obs"
];

// 临时禁用状态
let isTemporarilyDisabled = false;

// 临时禁用阻止功能
function temporarilyDisableBlocking() {
  isTemporarilyDisabled = true;

  // 1分钟后重新启用
  setTimeout(() => {
    isTemporarilyDisabled = false;
  }, 60 * 1000);
}

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 如果临时禁用了阻止功能，直接返回
  if (isTemporarilyDisabled) return;

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
    temporarilyDisableBlocking();
    sendResponse({ success: true });
  }
}); 