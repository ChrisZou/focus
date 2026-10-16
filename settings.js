document.addEventListener('DOMContentLoaded', async () => {
  // 获取DOM元素
  const addSiteBtn = document.getElementById('addSiteBtn');
  const addForm = document.getElementById('addForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const saveBtn = document.getElementById('saveBtn');
  const sitesList = document.getElementById('sitesList');
  const domainInput = document.getElementById('domainInput');
  const nameInput = document.getElementById('nameInput');
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
    const trimmed = value.trim();
    if (trimmed && (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)))) {
      return undefined;
    }
    return Number(trimmed) > 0 ? Number(trimmed) : null;
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
    document.getElementById('allowSummary').textContent = `${currentAllowList.length} 条规则`;
    allowListEl.replaceChildren();
    if (currentAllowList.length === 0) {
      allowListEl.innerHTML = '<div class="empty"><b>还没有白名单规则</b><span>添加后，被屏蔽网站中的这些页面仍可访问</span></div>';
      return;
    }
    currentAllowList.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'rule';
      item.innerHTML = '<div class="n"></div><div class="k"></div><button class="lk del">删除</button>';
      item.querySelector('.n').textContent = rule;
      item.querySelector('.k').textContent = rule.includes('/') ? '域名 + 路径前缀' : '纯域名';
      item.querySelector('.del').addEventListener('click', () => removeAllowRule(rule));
      allowListEl.appendChild(item);
    });
  }

  // 显示/隐藏白名单表单
  addAllowBtn.addEventListener('click', () => {
    addAllowForm.hidden = false;
    addAllowBtn.disabled = true;
    allowRuleInput.focus();
  });

  cancelAllowBtn.addEventListener('click', () => hideAllowForm());

  function hideAllowForm() {
    addAllowForm.hidden = true;
    addAllowBtn.disabled = false;
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
      const data = await chrome.storage.local.get(['visitStats']);
      const stats = data.visitStats || {};

      // 计算总拦截次数
      let totalBlocked = 0;
      Object.values(stats).forEach(dayStats => {
        Object.values(dayStats).forEach(count => {
          totalBlocked += count;
        });
      });

      // 更新统计显示
      totalBlockedEl.textContent = totalBlocked.toLocaleString();
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
    const alwaysBlocked = currentBlockedSites.filter(site => !site.dailyLimit).length;
    document.getElementById('sitesSummary').textContent = `${currentBlockedSites.length} 个网站` +
      (alwaysBlocked ? ` · ${alwaysBlocked} 个始终屏蔽` : '');
    sitesList.replaceChildren();
    if (currentBlockedSites.length === 0) {
      sitesList.innerHTML = '<div class="empty"><b>还没有配置任何屏蔽网站</b><span>点击上方按钮添加你想要屏蔽的网站</span></div>';
      return;
    }
    currentBlockedSites.forEach((site, index) => {
      const row = document.createElement('div');
      row.className = 'site';
      row.innerHTML = '<div><div class="n"></div><div class="d"></div></div><div class="l"></div><div class="act"><button class="lk limit">修改限额</button><button class="lk del">删除</button></div>';
      row.querySelector('.n').textContent = site.name;
      row.querySelector('.d').textContent = site.domain;
      const limit = row.querySelector('.l');
      if (site.dailyLimit) {
        const used = todayVisitCounts[site.domain] || 0;
        const exhausted = used >= site.dailyLimit;
        const count = document.createElement('b');
        count.textContent = used;
        count.classList.toggle('x', exhausted);
        limit.append(count, ` / ${site.dailyLimit} 次 · 今日已访问`);
        const meter = document.createElement('div');
        meter.className = 'meter';
        const fill = document.createElement('i');
        fill.classList.toggle('x', exhausted);
        fill.style.width = `${Math.min(100, used / site.dailyLimit * 100)}%`;
        meter.appendChild(fill);
        limit.appendChild(meter);
      } else {
        limit.innerHTML = '<b>始终屏蔽</b>';
      }
      row.querySelector('.del').addEventListener('click', () => removeSite(site.domain));
      row.querySelector('.limit').addEventListener('click', () => editDailyLimit(site, row, index));
      sitesList.appendChild(row);
    });
  }

  // 在当前行内编辑限额，保留其他行的状态。
  function editDailyLimit(site, row, index) {
    const limit = row.querySelector('.l');
    const actions = row.querySelector('.act');
    const editor = document.createElement('div');
    editor.className = 'edit';
    editor.innerHTML = `<div><label for="editLimit${index}">每日允许次数</label><input id="editLimit${index}" type="number" min="0" step="1" inputmode="numeric"></div><button class="b">确定</button><button class="lk">取消</button>`;
    const input = editor.querySelector('input');
    const save = editor.querySelector('.b');
    const cancel = editor.querySelector('.lk');
    input.value = site.dailyLimit || '';
    limit.hidden = true;
    actions.replaceChildren();
    // 编辑器位于中间列，操作列保持留空。
    row.insertBefore(editor, actions);
    const restore = () => {
      editor.remove();
      limit.hidden = false;
      actions.innerHTML = '<button class="lk limit">修改限额</button><button class="lk del">删除</button>';
      actions.querySelector('.limit').addEventListener('click', () => editDailyLimit(site, row, index));
      actions.querySelector('.del').addEventListener('click', () => removeSite(site.domain));
      actions.querySelector('.limit').focus();
    };
    cancel.addEventListener('click', restore);
    save.addEventListener('click', async () => {
      const dailyLimit = parseDailyLimit(input.value);
      if (input.validity.badInput || dailyLimit === undefined) {
        showMessage('限额需为 0 或正整数，请重新输入', 'error');
        input.focus();
        return;
      }
      save.disabled = true;
      cancel.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'updateBlockedSite', domain: site.domain, name: site.name, dailyLimit
        });
        if (!response.success) throw new Error(response.error || '保存失败');
        currentBlockedSites = response.sites;
        await loadDailyVisitCounts();
        renderSitesList();
        sitesList.children[index]?.querySelector('.limit')?.focus();
        showMessage(dailyLimit ? `已设置每日限额 ${dailyLimit} 次` : '已改为始终屏蔽', 'success');
      } catch (error) {
        showMessage(error.message || '保存失败', 'error');
        save.disabled = false;
        cancel.disabled = false;
      }
    });
    editor.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        (e.key === 'Enter' ? save : cancel).click();
      }
    });
    input.focus();
    input.select();
  }

  // 显示添加表单
  addSiteBtn.addEventListener('click', () => {
    addForm.hidden = false;
    addSiteBtn.disabled = true;
    domainInput.focus();
  });

  // 取消添加
  cancelBtn.addEventListener('click', () => {
    hideAddForm();
  });

  // 隐藏添加表单
  function hideAddForm() {
    addForm.hidden = true;
    addSiteBtn.disabled = false;
    clearForm();
  }

  // 清空表单
  function clearForm() {
    domainInput.value = '';
    nameInput.value = '';
    limitInput.value = '';
  }

  // 保存新网站
  saveBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    const name = nameInput.value.trim();
    const dailyLimit = parseDailyLimit(limitInput.value);
    if (limitInput.validity.badInput || dailyLimit === undefined) {
      showMessage('限额需为 0 或正整数，请重新输入', 'error');
      limitInput.focus();
      return;
    }

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

  // 复用状态区域，让辅助技术可以读出新提示。
  let toastTimer;
  function showMessage(message, type = 'success') {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.classList.toggle('error', type === 'error');
    toast.hidden = false;
    document.getElementById('toastText').textContent = message;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  function updateMessageCount() {
    document.getElementById('messageCount').textContent = customMessageInput.value.length;
  }
  customMessageInput.addEventListener('input', updateMessageCount);

  // 加载自定义提示语
  async function loadCustomMessage() {
    try {
      const data = await chrome.storage.local.get(['customMessage', 'messageSource', 'messageAvatar']);
      customMessageInput.value = data.customMessage || '保持专注';
      messageSourceInput.value = data.messageSource || '';
      messageAvatarInput.value = data.messageAvatar || '';
      updateMessageCount();
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
    if (e.isComposing) return;
    // Esc键取消添加
    if (e.key === 'Escape' && !addForm.hidden) {
      hideAddForm();
    }
    if (e.key === 'Escape' && !addAllowForm.hidden) {
      hideAllowForm();
    }
    // 白名单输入框中的Enter键保存
    if (e.key === 'Enter' && document.activeElement === allowRuleInput) {
      saveAllowBtn.click();
    }
    // Enter键保存（当焦点在表单中时）
    if (e.key === 'Enter' && !addForm.hidden) {
      if (addForm.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
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