console.log("=== Fanza Download Manager Content Script 起動 ===");

// 作品がダウンロード済みかチェックする関数
async function isWorkDownloaded(workId) {
  const result = await browser.storage.local.get('works');
  const works = result.works || [];
  return works.some(w => w.id === workId);
}

// URLから作品IDを抽出する関数
function extractWorkId(url) {
  let match = url.match(/product_id=([^/&]+)/);
  if (match) {
    return match[1];
  }
  
  match = url.match(/cid=([^/&]+)/);
  if (match) {
    return match[1];
  }
  
  return null;
}

// 処理済みの要素を追跡するためのWeakSet
const processedElements = new WeakSet();

// 単一の作品要素にボーダーを適用する関数
async function updateSingleWorkBorder(workElement) {
  // 既に処理済みならスキップ
  if (processedElements.has(workElement)) {
    return;
  }
  
  const linkElement = workElement.querySelector('a');
  
  if (!linkElement || !linkElement.href) {
    return;
  }
  
  const workUrl = linkElement.href;
  const workId = extractWorkId(workUrl);
  
  if (!workId) {
    return;
  }
  
  const isDownloaded = await isWorkDownloaded(workId);
  
  if (isDownloaded) {
    console.log(`✓ 作品 ${workId} はダウンロード済み`);
    workElement.style.borderLeft = '4px solid #4CAF50';
    workElement.style.paddingLeft = '8px';
  } else {
    console.log(`- 作品 ${workId} は未ダウンロード`);
    workElement.style.borderLeft = '';
    workElement.style.paddingLeft = '';
  }
  
  // 処理済みとしてマーク
  processedElements.add(workElement);
}

// 全作品リストにボーダーを追加する関数
async function updateWorkListBorders(onlyNew = false) {
  const workElements = document.querySelectorAll('.localListProductzKID2');
  
  console.log(`作品要素を ${workElements.length} 件見つけました`);
  
  for (const workElement of workElements) {
    // onlyNew=trueの場合、未処理の要素のみ処理
    if (onlyNew && processedElements.has(workElement)) {
      continue;
    }
    
    await updateSingleWorkBorder(workElement);
  }
}

// デバウンス関数（短時間に何度も呼ばれるのを防ぐ）
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ページ読み込み時に実行
updateWorkListBorders();

// デバウンス付きの更新関数（300ms待ってから実行）
const debouncedUpdate = debounce(() => {
  updateWorkListBorders(true);  // 新しい要素のみ処理
}, 300);

// DOMの変更を監視（無限スクロールで要素が追加される場合に対応）
const observer = new MutationObserver((mutations) => {
  // 新しい .localListProductzKID2 要素が追加されたかチェック
  let hasNewWorkElements = false;
  
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 追加されたノード自体が対象クラスを持つか
        if (node.classList && node.classList.contains('localListProductzKID2')) {
          hasNewWorkElements = true;
          break;
        }
        // または子孫に対象クラスを持つ要素があるか
        if (node.querySelector && node.querySelector('.localListProductzKID2')) {
          hasNewWorkElements = true;
          break;
        }
      }
    }
    if (hasNewWorkElements) break;
  }
  
  if (hasNewWorkElements) {
    console.log("新しい作品要素が追加されました");
    debouncedUpdate();
  }
});

// body要素の変更を監視
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ストレージの変更を監視（新しくダウンロードされた時に更新）
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.works) {
    console.log("ストレージが更新されました。全ボーダーを更新します");
    // ストレージ更新時は全要素を再チェック（処理済みフラグをクリア）
    processedElements.clear = function() {
      // WeakSetにはclearメソッドがないので、新しいインスタンスで代用
    };
    updateWorkListBorders(false);
  }
});