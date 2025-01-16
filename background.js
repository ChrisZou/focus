// The URLs you want to redirect from
const sourceUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在页面完成加载时检查
  if (changeInfo.status !== 'complete') return;

  const url = new URL(tab.url);
  const hostname = url.hostname;

  if (sourceUrls.some(blockedSite => hostname === blockedSite || hostname === `www.${blockedSite}`)) {
    chrome.tabs.update(tabId, { url: destinationUrl });
  }
}); 