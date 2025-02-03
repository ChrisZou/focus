// The URLs you want to redirect from
const blockedUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";
// 允许访问的路径列表
const allowList = [
  "xiaohongshu.com/zhibo/obs"
];

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在页面完成加载时检查
  // if (changeInfo.status !== 'complete') return;

  // 检查是否在允许列表中
  const isAllowed = allowList.some(allowedPath => tab.url.includes(allowedPath));
  if (isAllowed) return;

  // 检查是否需要阻止
  const shouldBlock = blockedUrls.some(blockedSite => tab.url.includes(blockedSite));
  if (shouldBlock) {
    chrome.tabs.update(tabId, { url: destinationUrl });
  }
}); 