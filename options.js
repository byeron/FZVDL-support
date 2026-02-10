// 作品数を表示
async function updateWorkCount() {
  const result = await browser.storage.local.get('works');
  const works = result.works || [];
  document.getElementById('workCount').textContent = `保存済み作品数: ${works.length}`;
}

// ステータスメッセージを表示
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'error' : 'success';
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

// エクスポート
document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    const result = await browser.storage.local.get('works');
    const works = result.works || [];
    
    const dataStr = JSON.stringify(works, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fanza-works-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    showStatus(`${works.length}件の作品データをエクスポートしました`);
  } catch (error) {
    console.error('エクスポートエラー:', error);
    showStatus('エクスポートに失敗しました', true);
  }
});

// インポート
document.getElementById('importBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('importFile');
  const file = fileInput.files[0];
  
  if (!file) {
    showStatus('ファイルを選択してください', true);
    return;
  }
  
  try {
    const text = await file.text();
    const importedWorks = JSON.parse(text);
    
    if (!Array.isArray(importedWorks)) {
      throw new Error('不正なファイル形式です');
    }
    
    // 既存データを取得
    const result = await browser.storage.local.get('works');
    const existingWorks = result.works || [];
    
    // マージ（重複は上書き）
    const mergedMap = new Map();
    
    // 既存データを追加
    existingWorks.forEach(work => {
      mergedMap.set(work.id, work);
    });
    
    // インポートデータで上書き
    importedWorks.forEach(work => {
      if (work.id) {
        mergedMap.set(work.id, work);
      }
    });
    
    const mergedWorks = Array.from(mergedMap.values());
    
    // 保存
    await browser.storage.local.set({ works: mergedWorks });
    
    showStatus(`${importedWorks.length}件をインポートしました。合計: ${mergedWorks.length}件`);
    await updateWorkCount();
    
    // ファイル選択をリセット
    fileInput.value = '';
    
  } catch (error) {
    console.error('インポートエラー:', error);
    showStatus('インポートに失敗しました: ' + error.message, true);
  }
});

// データを表示
document.getElementById('showDataBtn').addEventListener('click', async () => {
  const result = await browser.storage.local.get('works');
  const works = result.works || [];
  console.log('=== 保存済み作品一覧 ===');
  console.log(works);
  showStatus('コンソールにデータを表示しました');
});

// 全データ削除
document.getElementById('clearBtn').addEventListener('click', async () => {
  const confirmed = confirm('本当に全てのデータを削除しますか？この操作は取り消せません。');
  
  if (confirmed) {
    await browser.storage.local.clear();
    showStatus('全データを削除しました');
    await updateWorkCount();
  }
});

// 初期化
updateWorkCount();