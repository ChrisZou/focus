document.addEventListener('DOMContentLoaded', async () => {
  // 获取DOM元素
  const addSiteBtn = document.getElementById('addSiteBtn');
  const addForm = document.getElementById('addForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const saveBtn = document.getElementById('saveBtn');
  const sitesList = document.getElementById('sitesList');
  const domainInput = document.getElementById('domainInput');
  const nameInput = document.getElementById('nameInput');
  const timeInput = document.getElementById('timeInput');
  const limitInput = document.getElementById('limitInput');

  // 白名单元素
  const addAllowBtn = document.getElementById('addAllowBtn');
  const addAllowForm = document.getElementById('addAllowForm');
  const cancelAllowBtn = document.getElementById('cancelAllowBtn');
  const saveAllowBtn = document.getElementById('saveAllowBtn');
  const allowListEl = document.getElementById('allowList');
  const allowRuleInput = document.getElementById('allowRuleInput');

  // 自定义提示语元素
  const customMessageInput = document.getElementById('customMessageInput');
  const messageSourceInput = document.getElementById('messageSourceInput');
  const messageAvatarInput = document.getElementById('messageAvatarInput');
  const saveMessageBtn = document.getElementById('saveMessageBtn');

  // 统计元素
  const totalSitesEl = document.getElementById('totalSites');
  const totalBlockedEl = document.getElementById('totalBlocked');
  const totalSavedEl = document.getElementById('totalSaved');

  let currentBlockedSites = [];
  let currentAllowList = [];
  let todayVisitCounts = {};

  // 显示版本号
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

  // 初始化页面
  await loadData();

  // 加载所有数据
  async function loadData() {
    try {
      await Promise.all([
        loadBlockedSites(),
        loadAllowList(),
        loadStats(),
        loadCustomMessage()
      ]);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }

  // 加载屏蔽网站列表
  async function loadBlockedSites() {
    try {
      await loadDailyVisitCounts();
      const response = await chrome.runtime.sendMessage({ action: 'getBlockedSites' });
      if (response.success) {
        currentBlockedSites = response.sites;
        renderSitesList();
        updateSitesCount();
      }
    } catch (error) {
      console.error('加载网站列表失败:', error);
    }
  }

  // 加载今日各网站访问次数（限额计数）
  async function loadDailyVisitCounts() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDailyVisitInfo' });
      todayVisitCounts = {};
      if (response && response.success) {
        response.info.forEach(item => { todayVisitCounts[item.domain] = item.used; });
      }
    } catch (error) {
      console.error('加载今日访问次数失败:', error);
    }
  }

  // 解析每日限额输入：正整数启用限额，否则为 null（始终屏蔽）
  function parseDailyLimit(value) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  // 加载白名单
  async function loadAllowList() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllowList' });
      if (response.success) {
        currentAllowList = response.rules;
        renderAllowList();
      }
    } catch (error) {
      console.error('加载白名单失败:', error);
    }
  }

  // 渲染白名单列表
  function renderAllowList() {
    if (currentAllowList.length === 0) {
      allowListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔓</div>
          <div>还没有配置任何白名单规则</div>
          <div style="margin-top: 8px; font-size: 12px;">点击上方按钮添加允许访问的子域名或页面</div>
        </div>
      `;
      return;
    }

    allowListEl.innerHTML = '';
    currentAllowList.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'site-item';
      const hasPath = rule.includes('/');
      item.innerHTML = `
        <div class="site-info">
          <div class="site-name"></div>
          <div class="site-details">
            <div>${hasPath ? '匹配该路径及其下所有页面' : '匹配该域名及其子域名'}</div>
          </div>
        </div>
        <div class="site-actions">
          <button class="btn btn-small btn-danger">删除</button>
        </div>
      `;
      item.querySelector('.site-name').textContent = rule;
      item.querySelector('.btn-danger').addEventListener('click', () => removeAllowRule(rule));
      allowListEl.appendChild(item);
    });
  }

  // 显示/隐藏白名单表单
  addAllowBtn.addEventListener('click', () => {
    addAllowForm.classList.add('show');
    addAllowBtn.style.display = 'none';
    allowRuleInput.focus();
  });

  cancelAllowBtn.addEventListener('click', () => hideAllowForm());

  function hideAllowForm() {
    addAllowForm.classList.remove('show');
    addAllowBtn.style.display = 'block';
    allowRuleInput.value = '';
  }

  // 保存白名单规则
  saveAllowBtn.addEventListener('click', async () => {
    const rule = allowRuleInput.value.trim();
    if (!rule) {
      showMessage('请输入域名或域名+路径', 'error');
      return;
    }

    const hostPart = rule.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
    if (!isValidDomain(hostPart)) {
      showMessage('请输入有效的域名，例如: space.bilibili.com/12345', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ action: 'addAllowRule', rule });
      if (response.success) {
        currentAllowList = response.rules;
        renderAllowList();
        hideAllowForm();
        showMessage('白名单规则添加成功！', 'success');
      } else {
        showMessage(response.error || '添加失败', 'error');
      }
    } catch (error) {
      console.error('添加白名单失败:', error);
      showMessage('添加失败', 'error');
    }
  });

  // 删除白名单规则
  async function removeAllowRule(rule) {
    if (!confirm(`确定要删除白名单规则"${rule}"吗？`)) return;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'removeAllowRule', rule });
      if (response.success) {
        currentAllowList = response.rules;
        renderAllowList();
        showMessage('白名单规则删除成功！', 'success');
      } else {
        showMessage('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除白名单失败:', error);
      showMessage('删除失败', 'error');
    }
  }

  // 加载统计数据
  async function loadStats() {
    try {
      const data = await chrome.storage.local.get(['visitStats', 'totalSavedTime']);
      const stats = data.visitStats || {};
      const totalSavedTime = data.totalSavedTime || 0;

      // 计算总拦截次数
      let totalBlocked = 0;
      Object.values(stats).forEach(dayStats => {
        Object.values(dayStats).forEach(count => {
          totalBlocked += count;
        });
      });

      // 更新统计显示
      totalBlockedEl.textContent = totalBlocked;
      totalSavedEl.textContent = (totalSavedTime / 60).toFixed(1);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }

  // 更新网站数量统计
  function updateSitesCount() {
    totalSitesEl.textContent = currentBlockedSites.length;
  }

  // 渲染网站列表
  function renderSitesList() {
    if (currentBlockedSites.length === 0) {
      sitesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🌟</div>
          <div>还没有配置任何屏蔽网站</div>
          <div style="margin-top: 8px; font-size: 12px;">点击上方按钮添加你想要屏蔽的网站</div>
        </div>
      `;
      return;
    }

    sitesList.innerHTML = '';
    currentBlockedSites.forEach(site => {
      const siteItem = document.createElement('div');
      siteItem.className = 'site-item';
      siteItem.innerHTML = `
        <div class="site-info">
          <div class="site-name">${site.name}</div>
          <div class="site-details">
            <div class="site-domain">${site.domain}</div>
            <div>平均时长: ${site.avgTime}分钟</div>
            <div>${site.dailyLimit ? `每日限额: ${site.dailyLimit}次（今日已访问 ${todayVisitCounts[site.domain] || 0} 次）` : '始终屏蔽'}</div>
          </div>
        </div>
        <div class="site-actions">
          <button class="btn btn-small btn-primary btn-limit" data-domain="${site.domain}">设置限额</button>
          <button class="btn btn-small btn-danger" data-domain="${site.domain}">删除</button>
        </div>
      `;
      sitesList.appendChild(siteItem);
    });

    // 绑定删除按钮事件
    sitesList.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.getAttribute('data-domain');
        await removeSite(domain);
      });
    });

    // 绑定设置限额按钮事件
    sitesList.querySelectorAll('.btn-limit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.getAttribute('data-domain');
        await editDailyLimit(domain);
      });
    });
  }

  // 编辑每日访问限额
  async function editDailyLimit(domain) {
    const site = currentBlockedSites.find(s => s.domain === domain);
    if (!site) return;
    const input = prompt(`设置"${site.name}"每日允许访问次数（留空或0表示始终屏蔽）：`, site.dailyLimit || '');
    if (input === null) return;
    const trimmed = input.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) {
      showMessage('请输入非负整数', 'error');
      return;
    }
    const dailyLimit = parseDailyLimit(trimmed);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateBlockedSite',
        domain: site.domain,
        name: site.name,
        avgTime: site.avgTime,
        dailyLimit
      });
      if (response.success) {
        currentBlockedSites = response.sites;
        await loadDailyVisitCounts();
        renderSitesList();
        showMessage(dailyLimit ? `已设置每日限额 ${dailyLimit} 次` : '已改为始终屏蔽', 'success');
      } else {
        showMessage(response.error || '保存失败', 'error');
      }
    } catch (error) {
      console.error('设置限额失败:', error);
      showMessage('保存失败', 'error');
    }
  }

  // 显示添加表单
  addSiteBtn.addEventListener('click', () => {
    addForm.classList.add('show');
    addSiteBtn.style.display = 'none';
    domainInput.focus();
  });

  // 取消添加
  cancelBtn.addEventListener('click', () => {
    hideAddForm();
  });

  // 隐藏添加表单
  function hideAddForm() {
    addForm.classList.remove('show');
    addSiteBtn.style.display = 'block';
    clearForm();
  }

  // 清空表单
  function clearForm() {
    domainInput.value = '';
    nameInput.value = '';
    timeInput.value = '';
    limitInput.value = '';
  }

  // 保存新网站
  saveBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    const name = nameInput.value.trim();
    const avgTime = parseInt(timeInput.value) || 30;
    const dailyLimit = parseDailyLimit(limitInput.value);

    if (!domain || !name) {
      showMessage('请填写完整信息', 'error');
      return;
    }

    // 验证域名格式
    if (!isValidDomain(domain)) {
      showMessage('请输入有效的域名，例如: youtube.com', 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'addBlockedSite',
        domain: domain.toLowerCase(),
        name,
        avgTime,
        dailyLimit
      });

      if (response.success) {
        currentBlockedSites = response.sites;
        renderSitesList();
        updateSitesCount();
        hideAddForm();
        showMessage('网站添加成功！', 'success');
      } else {
        showMessage(response.error || '添加失败', 'error');
      }
    } catch (error) {
      console.error('添加网站失败:', error);
      showMessage('添加失败', 'error');
    }
  });

  // 删除网站
  async function removeSite(domain) {
    const site = currentBlockedSites.find(s => s.domain === domain);
    if (!confirm(`确定要删除"${site.name}"吗？`)) return;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'removeBlockedSite',
        domain
      });

      if (response.success) {
        currentBlockedSites = response.sites;
        renderSitesList();
        updateSitesCount();
        showMessage('网站删除成功！', 'success');
      } else {
        showMessage('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除网站失败:', error);
      showMessage('删除失败', 'error');
    }
  }

  // 验证域名格式
  function isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,}|[a-zA-Z0-9-]{2,}\.?[a-zA-Z]{2,})$/;
    return domainRegex.test(domain);
  }

  // 显示消息提示
  function showMessage(message, type = 'info') {
    // 移除已存在的消息
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // 创建新消息
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
      background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
    `;

    // 添加CSS动画
    if (!document.querySelector('#message-styles')) {
      const styles = document.createElement('style');
      styles.id = 'message-styles';
      styles.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(messageEl);

    // 3秒后自动消失
    setTimeout(() => {
      messageEl.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      }, 300);
    }, 3000);
  }

  // 加载自定义提示语
  async function loadCustomMessage() {
    try {
      const data = await chrome.storage.local.get(['customMessage', 'messageSource', 'messageAvatar']);
      customMessageInput.value = data.customMessage || '保持专注';
      messageSourceInput.value = data.messageSource || '';
      messageAvatarInput.value = data.messageAvatar || '';
    } catch (error) {
      console.error('加载自定义提示语失败:', error);
    }
  }

  // 保存自定义提示语
  saveMessageBtn.addEventListener('click', async () => {
    const message = customMessageInput.value.trim() || '保持专注';
    const source = messageSourceInput.value.trim();
    const avatar = messageAvatarInput.value.trim();

    if (avatar && !/^https?:\/\//i.test(avatar)) {
      showMessage('来源头像请填写有效的图片URL（以 http:// 或 https:// 开头）', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        customMessage: message,
        messageSource: source,
        messageAvatar: avatar
      });
      showMessage('提示语保存成功！', 'success');
    } catch (error) {
      console.error('保存自定义提示语失败:', error);
      showMessage('保存失败', 'error');
    }
  });

  // 键盘快捷键支持
  document.addEventListener('keydown', (e) => {
    // Esc键取消添加
    if (e.key === 'Escape' && addForm.classList.contains('show')) {
      hideAddForm();
    }
    if (e.key === 'Escape' && addAllowForm.classList.contains('show')) {
      hideAllowForm();
    }
    // 白名单输入框中的Enter键保存
    if (e.key === 'Enter' && document.activeElement === allowRuleInput) {
      saveAllowBtn.click();
    }
    // Enter键保存（当焦点在表单中时）
    if (e.key === 'Enter' && addForm.classList.contains('show')) {
      if (document.activeElement.tagName === 'INPUT') {
        saveBtn.click();
      }
    }
    // 来源输入框中的Enter键保存；提示语textarea中用Ctrl/Cmd+Enter保存
    if (e.key === 'Enter' && [messageSourceInput, messageAvatarInput].includes(document.activeElement)) {
      saveMessageBtn.click();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement === customMessageInput) {
      saveMessageBtn.click();
    }
  });
}); 