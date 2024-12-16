// The URLs you want to redirect from
const sourceUrls = ["x.com", "youtube.com", "xiaohongshu.com"];
// The URL you want to redirect to
const destinationUrl = "https://google.com";

chrome.webNavigation.onBeforeNavigate.addListener(function (details) {
  // Check if the URL contains any of the blocked sites
  if (sourceUrls.some(url => details.url.includes(url))) {
    chrome.tabs.update(details.tabId, {
      url: destinationUrl
    });
  }
}); 