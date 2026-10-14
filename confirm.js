// 获取URL参数
const params = new URLSearchParams(window.location.search);
const site = params.get('site') || '';
const domain = params.get('domain') || '';
const target = params.get('target') || '';
const dailyLimit = parseInt(params.get('dailyLimit')) || 0;
const dailyUsed = parseInt(params.get('dailyUsed')) || 0;

const siteLabel = site || domain || '这个网站';
const phrase = `是的，我确定一定以及肯定现在就要访问 ${siteLabel}`;

// 比较时忽略空白、全角/半角差异（NFKC 把 ，转成 ,）和大小写
function normalize(s) {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function render() {
  const remaining = Math.max(0, dailyLimit - dailyUsed);
  document.getElementById('headline').textContent = `你确定、一定以及肯定，现在就要访问 ${siteLabel} 吗？`;
  document.getElementById('phrase').textContent = phrase;
  document.getElementById('remainingText').textContent = `${remaining} 次`;
  document.getElementById('usedText').textContent = `今天还剩 · 已用 ${dailyUsed} / ${dailyLimit}`;
}

let confirming = false;

function update() {
  const input = document.getElementById('phraseInput');
  const msg = document.getElementById('msg');
  const typed = normalize(input.value);
  const want = normalize(phrase);
  const ok = typed === want;
  document.body.classList.toggle('ok', ok);
  if (!confirming) document.getElementById('confirmBtn').disabled = !ok;
  msg.classList.remove('warn');
  if (ok) msg.textContent = '输入一致，可以进入';
  else if (typed && !want.startsWith(typed)) msg.textContent = '有字不对，请对照上面的句子';
  else msg.textContent = '';
}

function warnNoPaste(e) {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = '不能粘贴，请手动逐字输入';
  msg.classList.add('warn');
}

// 禁止粘贴/拖放/自动替换，只允许手动输入（含输入法组合输入）
function guardInput(input) {
  ['paste', 'drop', 'dragover'].forEach(type => input.addEventListener(type, warnNoPaste));
  input.addEventListener('beforeinput', e => {
    if (['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertReplacementText', 'insertFromYank'].includes(e.inputType)) {
      warnNoPaste(e);
    }
  });
  input.addEventListener('input', update);
}

// 禁止复制目标句子
function guardPhrase(el) {
  ['copy', 'cut', 'selectstart', 'dragstart', 'contextmenu'].forEach(type =>
    el.addEventListener(type, e => e.preventDefault()));
}

// 点击确认：交给后台计数并放行
async function confirmVisit() {
  const btn = document.getElementById('confirmBtn');
  const errorEl = document.getElementById('errorText');
  if (normalize(document.getElementById('phraseInput').value) !== normalize(phrase)) return;
  confirming = true;
  btn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'confirmVisit', domain, target });
    if (response && response.success) return; // 后台会将当前标签页跳转到目标网站
    errorEl.textContent = (response && response.error) || '确认失败，请重试';
    errorEl.style.display = 'block';
    confirming = false;
    if (response && response.exhausted) btn.disabled = true; else update();
  } catch (error) {
    console.error('确认访问失败:', error);
    errorEl.textContent = '确认失败，请重试';
    errorEl.style.display = 'block';
    confirming = false;
    update();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  render();
  const input = document.getElementById('phraseInput');
  guardInput(input);
  guardPhrase(document.getElementById('phrase'));
  guardPhrase(document.getElementById('headline'));
  document.getElementById('confirmBtn').addEventListener('click', confirmVisit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) confirmVisit();
  });
  input.focus();
  update();
});
