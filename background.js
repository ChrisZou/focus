// The URLs you want to redirect from
const sourceUrls = ["x.com", "youtube.com", "twitter.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";

chrome.webNavigation.onBeforeNavigate.addListener(function (details) {
  // 获取URL的主域名
  const url = new URL(details.url);
  const hostname = url.hostname;

  // 检查是否直接访问被屏蔽的网站
  if (sourceUrls.some(blockedSite => hostname === blockedSite || hostname === `www.${blockedSite}`)) {
    chrome.tabs.update(details.tabId, {
      url: destinationUrl
    });
  }
}); 