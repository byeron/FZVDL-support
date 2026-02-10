/* 実装されているロジックの確認
    見る順番
    1. browser.download.onCreated.addListener <- ダウンロード開始時に動作する関数を登録
        - browser.tabs.query: 条件に合うタブの情報を取得する
    2. browser.downloads.onChanged.addListener <- ダウンロードアイテムの状態が変化した際に動作する関数を登録
        - isFanzaWork : URLがFanzaのURLかどうかを返す
        - extractWorkId : URL から作品IDを抽出する
        - saveWorkInfo : ダウンロードされた作品情報を保存する
        - 最後に一時的にダウンロードIDとURLを紐づけていたmapを削除

    3. saveWorkInfo <- ダウンロードされた作品情報を保存する
        - browser.storage.local.get: ref -> https://developer.mozilla.org/ja/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/get
        - "work" という key でmapされているリストを取得する
        - work 内を workId(Fanza 作品 id)で検索する
            - ストレージ内に存在しているとき -> 情報を更新
            - ストレージ内に存在してないとき -> 新たな情報をリストにpush
        - 更新後のリストを再セット

    4. browser.tabs.onActivated.addListener <- タブがアクティブになった時に動作する関数を登録
        - tab の URL を取得し、storage local と照合してアイコンを変更する

    4. browser.tabs.onUpdated.addListener <- タブがアップデートされた時に動作する関数を登録
        - tab の URL を取得し、storage local と照合してアイコンを変更する
*/

/* 実装済みの機能
    - Mylibrary上の作品ページでダウンロード状態に基づいてアイコンが変更される
    - Mylibrary上のDL済み作品の left-border の色を緑色に変更する
    - 拡張機能のオプションページにエクスポート/インポート機能を付ける
    - 拡張機能のオプションページに storage.local をリセットする機能を付ける

*/

/* 追加すべき機能のリスト
    - 各作品ページでのダウンロード状況を追跡するのをやめる（一旦）
    - My library 上の処理のパフォーマンスを上げる
    - 作品登録時に、作品名とサークル名を同時に登録する
*/

// 作品情報を保存
async function saveWorkInfo(workId, url, filename) {
    try {
        const workInfo = {
            id: workId,
            url: url,
            filename: filename,
            downloadDate: new Date().toISOString()
        };

        const result = await browser.storage.local.get('works');
        const works = result.works || [];

        const existingIndex = works.findIndex(w => w.id === workId);
        if (existingIndex >= 0) {
            works[existingIndex] = workInfo;
            console.log("作品情報を更新:", workId);
        } else {
            works.push(workInfo);
            console.log("新しい作品を登録:", workId);
        }

        await browser.storage.local.set({ works: works });
        console.log("保存完了。総作品数:", works.length);

    } catch (error) {
        console.error("保存エラー:", error);
    }
}

// アイコンを更新する関数
async function updateIcon(tabId, url) {
    if (!isFanzaWork(url)) {
        // Fanzaのページでない場合はデフォルトアイコン
        await browser.browserAction.setIcon({
            tabId: tabId,
            path: {
                48: "icons/icon-default-48.png",
                96: "icons/icon-default-96.png"
            }
        });
        return;
    }

    const workId = extractWorkId(url);
    if (!workId) {
        await browser.browserAction.setIcon({
            tabId: tabId,
            path: {
                48: "icons/icon-default-48.png",
                96: "icons/icon-default-96.png"
            }
        });
        return;
    }

    const isDownloaded = await isWorkDownloaded(workId);

    if (isDownloaded) {
        console.log(`✓ タブ ${tabId}: 作品 ${workId} はダウンロード済み`);
        await browser.browserAction.setIcon({
            tabId: tabId,
            path: {
                48: "icons/icon-downloaded-48.png",
                96: "icons/icon-downloaded-96.png"
            }
        });
    } else {
        console.log(`- タブ ${tabId}: 作品 ${workId} は未ダウンロード`);
        await browser.browserAction.setIcon({
            tabId: tabId,
            path: {
                48: "icons/icon-default-48.png",
                96: "icons/icon-default-96.png"
            }
        });
    }
}

// タブが切り替わったときにアイコンを更新
browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await updateIcon(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error("タブ切り替えエラー:", error);
  }
});

// タブのURLが更新されたときにアイコンを更新
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await updateIcon(tabId, changeInfo.url);
  }
});

// ダウンロード開始時にタブURLを記録
const downloadTabMap = new Map();

// ダウンロード時にアクティブなタブのURLをダウンロードIDとバインドして保存する
browser.downloads.onCreated.addListener(async (downloadItem) => {
    console.log("=== ダウンロード開始 ===", downloadItem.id);

    try {
        // アクティブなタブを取得
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const currentUrl = tabs[0].url;
            console.log("現在のページURL:", currentUrl);

            // ダウンロードIDとタブURLを紐付け
            downloadTabMap.set(downloadItem.id, currentUrl);
        }
    } catch (error) {
        console.error("タブ情報取得エラー:", error);
    }
});

// ダウンロード完了を監視
browser.downloads.onChanged.addListener(async (downloadDelta) => {
    if (downloadDelta.state && downloadDelta.state.current === "complete") {
        console.log("=== ダウンロード完了 ===", downloadDelta.id);

        try {
            const downloads = await browser.downloads.search({ id: downloadDelta.id });
            const download = downloads[0];

            console.log("ファイル名:", download.filename);

            const pageUrl = downloadTabMap.get(downloadDelta.id);

            // ページURLがないとき処理終了
            if (!pageUrl) {
                console.log("⚠ ページURLが見つかりませんでした");
                return;
            }
            console.log("ダウンロード元ページ:", pageUrl);

            // ページURLがFANZAのリンクではないとき処理終了
            if (!isFanzaWork(pageUrl)) {
                console.log("- Fanza作品ではありません");
                downloadTabMap.delete(downloadDelta.id);
                return;
            }

            console.log("✓ Fanza作品を検知");

            const workId = extractWorkId(pageUrl);

            // 作品IDが抽出できないとき処理終了
            if (!workId) {
                console.log("⚠ 作品IDを抽出できませんでした");
                downloadTabMap.delete(downloadDelta.id);
                return;
            }

            console.log("作品ID:", workId);
            await saveWorkInfo(workId, pageUrl, download.filename);

            downloadTabMap.delete(downloadDelta.id);

        } catch (error) {
            console.error("エラー:", error);
        }
    }
});
