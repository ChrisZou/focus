// 默认的被屏蔽网站列表
const defaultBlockedSites = [
  { domain: "x.com", name: "X (Twitter)" },
  { domain: "youtube.com", name: "YouTube" },
  { domain: "twitter.com", name: "Twitter" },
  { domain: "xiaohongshu.com", name: "小红书" },
  { domain: "bilibili.com", name: "B站" }
];

// 重定向目标URL
const destinationUrl = chrome.runtime.getURL('redirect.html');

// 每日限额网站的访问确认页
const confirmPageUrl = chrome.runtime.getURL('confirm.html');

// 默认白名单规则（即使域名被屏蔽，也允许访问）
// 规则支持两种写法：
//   1. 纯域名，如 creator.xiaohongshu.com（匹配该域名及其子域名）
//   2. 域名+路径前缀，如 space.bilibili.com/12345（匹配该路径及其下所有页面）
const defaultAllowList = [
  "creator.xiaohongshu.com",
];

// 获取用户配置的白名单
async function getAllowList() {
  const data = await chrome.storage.local.get(['allowList']);
  return Array.isArray(data.allowList) ? data.allowList : defaultAllowList;
}

// 初始化默认白名单
async function initializeAllowList() {
  const data = await chrome.storage.local.get(['allowList']);
  if (!Array.isArray(data.allowList)) {
    await chrome.storage.local.set({ allowList: defaultAllowList });
  }
}

// 规范化白名单规则：去掉协议、www.、末尾斜杠，统一小写
function normalizeAllowRule(rule) {
  let r = String(rule || '').trim().toLowerCase();
  r = r.replace(/^https?:\/\//, '');
  r = r.replace(/^www\./, '');
  r = r.split(/[?#]/)[0];
  r = r.replace(/\/+$/, '');
  return r;
}

// 判断 hostname 是否等于 domain 或是其子域名
function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

// 判断 URL 是否命中某条白名单规则
function matchesAllowRule(urlObj, rule) {
  const normalized = normalizeAllowRule(rule);
  if (!normalized) return false;
  const slashIndex = normalized.indexOf('/');
  const ruleHost = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
  const rulePath = slashIndex === -1 ? '' : normalized.slice(slashIndex);

  const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
  if (!hostMatches(hostname, ruleHost)) return false;
  if (!rulePath) return true;

  const path = urlObj.pathname.replace(/\/+$/, '') || '/';
  return path === rulePath || path.startsWith(rulePath + '/');
}

// 判断 URL 是否在白名单中
async function isUrlAllowed(url) {
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch (e) {
    return false;
  }
  const allowList = await getAllowList();
  return allowList.some(rule => matchesAllowRule(urlObj, rule));
}

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

// 获取今天的日期字符串 (YYYY-MM-DD，本地时区)
function getTodayString() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 获取某个网站今日已访问次数（仅计入限额内的允许访问）
async function getDailyVisitCount(domain) {
  const today = getTodayString();
  const data = await chrome.storage.local.get(['dailyVisitCounts']);
  const counts = data.dailyVisitCounts || {};
  if (!counts[today] || typeof counts[today][domain] !== 'number') {
    return 0;
  }
  return counts[today][domain];
}

// 增加今日访问计数（到达限额前的允许访问）
async function incrementDailyVisitCount(domain) {
  const today = getTodayString();
  const data = await chrome.storage.local.get(['dailyVisitCounts']);
  const counts = data.dailyVisitCounts || {};
  if (!counts[today]) {
    counts[today] = {};
  }
  counts[today][domain] = (counts[today][domain] || 0) + 1;
  // 清理过期日期，只保留今天
  const pruned = { [today]: counts[today] };
  await chrome.storage.local.set({ dailyVisitCounts: pruned });
  return counts[today][domain];
}

// 标签页离开限额网站后清除记录，再次进入时计为一次新访问
async function clearTabVisit(tabId) {
  const session = await chrome.storage.session.get(['tabVisits']);
  const tabVisits = session.tabVisits || {};
  const tabKey = String(tabId);
  if (tabKey in tabVisits) {
    delete tabVisits[tabKey];
    await chrome.storage.session.set({ tabVisits });
  }
}

// 标签页关闭时清除记录
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabVisit(tabId);
});

// 判断网站是否配置了每日访问限额（正整数）
function hasDailyLimit(site) {
  return Number.isInteger(site.dailyLimit) && site.dailyLimit > 0;
}

// 更新访问统计
async function updateVisitStats(blockedSite) {
  const today = getTodayString();
  const userId = await getUserId();

  // 获取当前统计数据
  const data = await chrome.storage.local.get(['visitStats']);
  const stats = data.visitStats || {};

  // 初始化今天的统计
  if (!stats[today]) {
    stats[today] = {};
  }
  if (!stats[today][blockedSite.domain]) {
    stats[today][blockedSite.domain] = 0;
  }

  // 增加拦截计数
  stats[today][blockedSite.domain]++;

  // 保存更新后的统计数据
  await chrome.storage.local.set({
    visitStats: stats
  });

  return {
    todayCount: stats[today][blockedSite.domain]
  };
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

  // 获取域名
  const domain = extractDomain(details.url);

  // 检查是否在白名单中
  if (await isUrlAllowed(details.url)) return;

  // 获取用户配置的屏蔽网站列表
  const blockedSites = await getBlockedSites();

  // 检查是否需要阻止（匹配域名本身及其所有子域名）
  const blockedSite = blockedSites.find(site => hostMatches(domain, site.domain));
  if (!blockedSite) {
    await clearTabVisit(details.tabId);
    return;
  }

  // 若配置了每日访问限额：未达限额先显示确认页（确认后才计数放行），达限额后按原逻辑屏蔽
  if (hasDailyLimit(blockedSite)) {
    // 同一标签页内在该网站内部跳转/刷新，不重复计数（同一天内）
    const session = await chrome.storage.session.get(['tabVisits']);
    const tabVisits = session.tabVisits || {};
    const tabKey = String(details.tabId);
    const sessionKey = getTodayString() + '|' + blockedSite.domain;
    if (tabVisits[tabKey] === sessionKey) return;

    // 未达限额：先跳转到确认页，用户点击“确认进入”后才计数并放行
    const used = await getDailyVisitCount(blockedSite.domain);
    if (used < blockedSite.dailyLimit) {
      const confirmUrl = new URL(confirmPageUrl);
      confirmUrl.searchParams.set('site', blockedSite.name);
      confirmUrl.searchParams.set('domain', blockedSite.domain);
      confirmUrl.searchParams.set('target', details.url);
      confirmUrl.searchParams.set('dailyLimit', String(blockedSite.dailyLimit));
      confirmUrl.searchParams.set('dailyUsed', String(used));
      chrome.tabs.update(details.tabId, { url: confirmUrl.toString() });
      return;
    }
  }

  // 更新访问统计（被拦截）
  const stats = await updateVisitStats(blockedSite);

  // 构建重定向URL，包含统计信息
  const redirectUrl = new URL(destinationUrl);
  redirectUrl.searchParams.set('site', blockedSite.name);
  redirectUrl.searchParams.set('domain', domain);
  redirectUrl.searchParams.set('count', stats.todayCount);
  if (hasDailyLimit(blockedSite)) {
    redirectUrl.searchParams.set('dailyLimit', String(blockedSite.dailyLimit));
    redirectUrl.searchParams.set('dailyUsed', String(blockedSite.dailyLimit));
  }

  // 取消当前导航并重定向到目标URL
  chrome.tabs.update(details.tabId, { url: redirectUrl.toString() });
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(async () => {
  // 1.5 迁移：仅清理旧功能字段，保留网站、限额、白名单和拦截统计。
  try {
    await chrome.storage.local.remove(['avgTime', 'totalSavedTime', 'savedTime', 'disableEndTime', 'disabledUntil']);
    const { blockedSites } = await chrome.storage.local.get(['blockedSites']);
    if (Array.isArray(blockedSites) && blockedSites.some(site => 'avgTime' in site)) {
      await chrome.storage.local.set({
        blockedSites: blockedSites.map(({ avgTime, ...site }) => site)
      });
    }
  } catch (error) {
    console.error('清理旧版存储失败:', error);
  }
  // 确保用户ID存在
  await getUserId();
  // 初始化默认屏蔽网站列表
  await initializeBlockedSites();
  // 初始化默认白名单
  await initializeAllowList();
});

// 监听来自扩展popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getBlockedSites') {
    getBlockedSites()
      .then(sites => sendResponse({ success: true, sites }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'addBlockedSite') {
    const { domain, name, dailyLimit } = request;
    getBlockedSites()
      .then(async sites => {
        // 检查是否已存在
        if (sites.some(site => site.domain === domain)) {
          sendResponse({ success: false, error: '该网站已在屏蔽列表中' });
          return;
        }
        // 添加新网站（dailyLimit 为正整数时启用每日限额，否则始终屏蔽）
        const site = { domain, name };
        if (Number.isInteger(dailyLimit) && dailyLimit > 0) {
          site.dailyLimit = dailyLimit;
        }
        sites.push(site);
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
  } else if (request.action === 'getAllowList') {
    getAllowList()
      .then(rules => sendResponse({ success: true, rules }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'addAllowRule') {
    const rule = normalizeAllowRule(request.rule);
    getAllowList()
      .then(async rules => {
        if (!rule) {
          sendResponse({ success: false, error: '规则不能为空' });
          return;
        }
        if (rules.includes(rule)) {
          sendResponse({ success: false, error: '该规则已在白名单中' });
          return;
        }
        rules.push(rule);
        await chrome.storage.local.set({ allowList: rules });
        sendResponse({ success: true, rules });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'removeAllowRule') {
    const { rule } = request;
    getAllowList()
      .then(async rules => {
        const filtered = rules.filter(r => r !== rule);
        await chrome.storage.local.set({ allowList: filtered });
        sendResponse({ success: true, rules: filtered });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'updateBlockedSite') {
    const { domain, name, dailyLimit } = request;
    getBlockedSites()
      .then(async sites => {
        const siteIndex = sites.findIndex(site => site.domain === domain);
        if (siteIndex === -1) {
          sendResponse({ success: false, error: '找不到该网站' });
          return;
        }
        const site = { domain, name };
        if (Number.isInteger(dailyLimit) && dailyLimit > 0) {
          site.dailyLimit = dailyLimit;
        }
        sites[siteIndex] = site;
        await chrome.storage.local.set({ blockedSites: sites });
        sendResponse({ success: true, sites });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'confirmVisit') {
    // 确认页点击“确认进入”：重新校验限额，计数并标记该标签页的本次访问，然后放行
    const tabId = sender.tab && sender.tab.id;
    const { domain, target } = request;
    (async () => {
      if (tabId === undefined) throw new Error('无法识别标签页');
      let targetUrl;
      try {
        targetUrl = new URL(target);
      } catch (e) {
        throw new Error('目标地址无效');
      }
      if (!/^https?:$/.test(targetUrl.protocol)) throw new Error('目标地址无效');
      const sites = await getBlockedSites();
      const site = sites.find(s => s.domain === domain);
      if (!site || !hasDailyLimit(site) || !hostMatches(extractDomain(target), site.domain)) {
        // 限额已被移除或配置变更：直接前往，由导航监听按当前配置处理
        chrome.tabs.update(tabId, { url: target });
        return { success: true };
      }
      const used = await getDailyVisitCount(site.domain);
      if (used >= site.dailyLimit) {
        return { success: false, exhausted: true, error: '今天的访问次数已用完' };
      }
      await incrementDailyVisitCount(site.domain);
      // 标记为本次访问（同时作为放行凭证），之后同标签页内的站内跳转不再提示
      const session = await chrome.storage.session.get(['tabVisits']);
      const tabVisits = session.tabVisits || {};
      tabVisits[String(tabId)] = getTodayString() + '|' + site.domain;
      await chrome.storage.session.set({ tabVisits });
      chrome.tabs.update(tabId, { url: target });
      return { success: true };
    })()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getDailyVisitInfo') {
    // 返回各屏蔽网站的今日访问次数与限额信息
    getBlockedSites()
      .then(async sites => {
        const today = getTodayString();
        const data = await chrome.storage.local.get(['dailyVisitCounts']);
        const counts = (data.dailyVisitCounts && data.dailyVisitCounts[today]) || {};
        const info = sites.map(site => ({
          domain: site.domain,
          name: site.name,
          dailyLimit: hasDailyLimit(site) ? site.dailyLimit : null,
          used: counts[site.domain] || 0
        }));
        sendResponse({ success: true, today, info });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
}); 