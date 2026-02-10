/* storage.local に格納されたダウンロード済み情報に基づき、Fanzaの My Library の見た目を変更する */

console.log("=== Fanza Download Manager Content Script 起動 ===");

// 作品リストにボーダーを追加する関数
async function updateWorkListBorders() {
  // localListProductzKID2 クラスを持つdiv要素を全て取得
  const workElements = document.querySelectorAll('.localListProductzKID2');
  
  console.log(`作品要素を ${workElements.length} 件見つけました`);
  
  for (const workElement of workElements) {
    // その中のa要素を取得
    const linkElement = workElement.querySelector('a');
    
    if (!linkElement || !linkElement.href) {
      continue;
    }
    
    const workUrl = linkElement.href;
    const workId = extractWorkId(workUrl);
    
    if (!workId) {
      continue;
    }
    
    const isDownloaded = await isWorkDownloaded(workId);
    
    if (isDownloaded) {
      console.log(`✓ 作品 ${workId} はダウンロード済み`);
      // 緑色の左ボーダーを追加
      workElement.style.borderLeft = '4px solid #4CAF50';
      workElement.style.paddingLeft = '8px';
    } else {
      console.log(`- 作品 ${workId} は未ダウンロード`);
      // ボーダーをリセット（更新時のため）
      workElement.style.borderLeft = '';
      workElement.style.paddingLeft = '';
    }
  }
}

// ページ読み込み時に実行
updateWorkListBorders();

// DOMの変更を監視（動的に要素が追加される場合に対応）
const observer = new MutationObserver(() => {
  updateWorkListBorders();
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
    console.log("ストレージが更新されました。ボーダーを更新します");
    updateWorkListBorders();
  }
});