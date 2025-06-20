// 默认的被屏蔽网站列表
const defaultBlockedSites = [
  { domain: "x.com", name: "X (Twitter)", avgTime: 30 },
  { domain: "youtube.com", name: "YouTube", avgTime: 45 },
  { domain: "twitter.com", name: "Twitter", avgTime: 30 },
  { domain: "xiaohongshu.com", name: "小红书", avgTime: 40 },
  { domain: "bilibili.com", name: "B站", avgTime: 45 }
];

// 重定向目标URL
const destinationUrl = chrome.runtime.getURL('redirect.html');

// 允许访问的路径列表
const allowList = [
  "creator.xiaohongshu.com",
];

// 获取用户配置的屏蔽网站列表
async function getBlockedSites() {
  const data = await chrome.storage.local.get(['blockedSites']);
  return data.blockedSites || defaultBlockedSites;
}

// 初始化默认屏蔽网站列表
async function initializeBlockedSites() {
  const data = await chrome.storage.local.get(['blockedSites']);
  if (!data.blockedSites) {
    await chrome.storage.local.set({ blockedSites: defaultBlockedSites });
  }
}

// 生成UUID v7
function generateUUID() {
  // 获取当前时间戳（毫秒）
  const timestamp = Date.now();

  // 将时间戳转换为大端字节序的48位十六进制字符串
  const timestampHex = timestamp.toString(16).padStart(12, '0');

  // 生成随机部分（共62位，这里用78个字符表示）
  const randomHex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  // 组装UUID v7
  // 格式: tttttttt-tttt-7nnn-nnnn-nnnnnnnnnnnn
  // 其中t是时间戳位，7是版本，n是随机位
  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7${randomHex.slice(0, 3)}-${(parseInt(randomHex.slice(3, 4), 16) & 0x3 | 0x8).toString(16)
    }${randomHex.slice(4, 7)}-${randomHex.slice(7, 19)}`;
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
  if (!stats[today][blockedSite.domain]) {
    stats[today][blockedSite.domain] = 0;
  }

  // 增加计数和保存的时间
  stats[today][blockedSite.domain]++;
  totalSavedTime += blockedSite.avgTime;

  // 保存更新后的统计数据
  await chrome.storage.local.set({
    visitStats: stats,
    totalSavedTime: totalSavedTime
  });

  return {
    todayCount: stats[today][blockedSite.domain],
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

// 从URL中提取域名
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    // 移除 www. 前缀
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

// 监听导航开始前的事件
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // 只处理主框架的导航
  if (details.frameId !== 0) return;

  // 如果临时禁用了阻止功能，直接返回
  if (await checkDisableStatus()) return;

  // 获取域名
  const domain = extractDomain(details.url);

  // 检查是否在允许列表中
  const isAllowed = allowList.some(allowedPath => domain === allowedPath);
  if (isAllowed) return;

  // 获取用户配置的屏蔽网站列表
  const blockedSites = await getBlockedSites();

  // 检查是否需要阻止
  const blockedSite = blockedSites.find(site => domain === site.domain);
  if (blockedSite) {
    // 更新访问统计
    const stats = await updateVisitStats(blockedSite);

    // 构建重定向URL，包含统计信息
    const redirectUrl = new URL(destinationUrl);
    redirectUrl.searchParams.set('site', blockedSite.name);
    redirectUrl.searchParams.set('count', stats.todayCount);
    redirectUrl.searchParams.set('savedTime', stats.totalSavedMinutes);
    redirectUrl.searchParams.set('avgTime', blockedSite.avgTime);

    // 取消当前导航并重定向到目标URL
    chrome.tabs.update(details.tabId, { url: redirectUrl.toString() });
  }
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(async () => {
  // 确保用户ID存在
  await getUserId();
  // 初始化默认屏蔽网站列表
  await initializeBlockedSites();
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
  } else if (request.action === 'getBlockedSites') {
    getBlockedSites()
      .then(sites => sendResponse({ success: true, sites }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'addBlockedSite') {
    const { domain, name, avgTime } = request;
    getBlockedSites()
      .then(async sites => {
        // 检查是否已存在
        if (sites.some(site => site.domain === domain)) {
          sendResponse({ success: false, error: '该网站已在屏蔽列表中' });
          return;
        }
        // 添加新网站
        sites.push({ domain, name, avgTime });
        await chrome.storage.local.set({ blockedSites: sites });
        sendResponse({ success: true, sites });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'removeBlockedSite') {
    const { domain } = request;
    getBlockedSites()
      .then(async sites => {
        const filteredSites = sites.filter(site => site.domain !== domain);
        await chrome.storage.local.set({ blockedSites: filteredSites });
        sendResponse({ success: true, sites: filteredSites });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'updateBlockedSite') {
    const { domain, name, avgTime } = request;
    getBlockedSites()
      .then(async sites => {
        const siteIndex = sites.findIndex(site => site.domain === domain);
        if (siteIndex === -1) {
          sendResponse({ success: false, error: '找不到该网站' });
          return;
        }
        sites[siteIndex] = { domain, name, avgTime };
        await chrome.storage.local.set({ blockedSites: sites });
        sendResponse({ success: true, sites });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
}); 