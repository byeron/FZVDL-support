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
    - ダウンロード時に作品情報に基づくディレクトリに格納する
    - 作品登録時に、作品名とサークル名を同時に登録する -> V2 にて実装
    - My library 上の処理のパフォーマンスを上げる

*/

/* 実装中
    - なし
*/

/* 追加すべき機能のリスト
    - 各作品ページでのダウンロード状況を追跡するのをやめる（一旦）
*/

// 作品情報を保存
async function saveWorkInfo(workId, url, filename, tabId) {
    try {
        //作品情報の定義
        const workInfo = {
            id: workId,
            url: url,
            filename: filename,
            downloadDate: new Date().toISOString(),
            title: null,  //optional
            circle: null, //optional
            releaseDate: null  // optional
        };

        const result = await browser.storage.local.get('works');
        const works = result.works || [];

        // ページ情報を取得（オプション）
        try {
            const pageInfo = await browser.tabs.sendMessage(tabId, { action: 'getPageInfo' });
            if (pageInfo) {
                workInfo.title = pageInfo.title;
                workInfo.circle = pageInfo.circle;
                workInfo.releaseDate = pageInfo.releaseDate;
            }
        } catch (error) {
            console.warn("ページ情報の取得に失敗（登録は継続）:", error);
        }

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

        const tabs = await browser.tabs.query({ active: true, currentWindow: true });  // DL完了時、ページの再読み込みなしにアイコンを変更する
        if (tabs.length > 0 && tabs[0].url) {
            await updateIcon(tabs[0].id, tabs[0].url);
        }

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

// ファイルシステムで使えない文字を除去する関数
function sanitizeFolderName(name) {
    // Windows/Linux/macOSで使えない文字を置換
    return name
        .replace(/[<>:"/\\|?*]/g, '_')  // 禁止文字を_に置換
        .replace(/\s+/g, ' ')            // 連続した空白を1つに
        .trim()
        .substring(0, 200);              // 長すぎる名前を切り詰め
}

// ダウンロード開始時にタブURLを記録
const downloadTabMap = new Map();

// 設定を取得する関数をcommon.jsに追加することも検討
async function getSettings() {
  const result = await browser.storage.local.get('settings');
  return result.settings || { autoFolder: true };
}

// 拡張機能が作成したダウンロードIDを記録するSet
const extensionDownloadUrls = new Set();

// ダウンロード時にアクティブなタブのURLをダウンロードIDとバインドして保存する
browser.downloads.onCreated.addListener(async (downloadItem) => {
    // 拡張機能自身が作成したダウンロードはスキップ
    if (extensionDownloadUrls.has(downloadItem.url)) {
        extensionDownloadUrls.delete(downloadItem.url);
        return;
    }
    console.log("=== ダウンロード開始 ===", downloadItem.id);

    try {
        // アクティブなタブを取得
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length == 0) return; // 有効なタブがないとき

        const currentUrl = tabs[0].url;
        const tabId = tabs[0].id;
        console.log("現在のページURL:", currentUrl);
        if (!isFanzaWork(currentUrl)) return; // URL が違うとき

        const workId = extractWorkId(currentUrl);
        if (!workId) return;  // 作品IDが抽出できなかったとき

        const settings = await getSettings();  //自動フォルダ分けをするかどうか > off
        if (!settings.autoFolder) {
            // ダウンロードIDとタブURLを紐付け
            downloadTabMap.set(downloadItem.id, { url: currentUrl, tabId: tabId });
            extensionDownloadUrls.add(downloadItem.url);
            console.log("自動フォルダ分けはオフです");
            return;
        }
        else {  //自動フォルダ分け on
            let folderPath = null;
            try {
                const pageInfo = await browser.tabs.sendMessage(tabId, { action: 'getPageInfo' });
                if (pageInfo && pageInfo.circle && pageInfo.title) {
                    // サークル名と作品名でサブフォルダを作成
                    const circle = sanitizeFolderName(pageInfo.circle);
                    const title = sanitizeFolderName(pageInfo.title);
                    const filename = downloadItem.filename.split(/[\\/]/).pop();
                    folderPath = `${circle}/${title}/${filename}`;
                }
            } catch (error) {
                console.warn("ページ情報の取得に失敗、デフォルトパスで保存:", error.message);
            }

            if (!folderPath) return;
            console.log("保存先を変更:", folderPath);

            extensionDownloadUrls.add(downloadItem.url);

            // 元のダウンロードをキャンセル
            await browser.downloads.cancel(downloadItem.id);
            await browser.downloads.erase({ id: downloadItem.id });
            downloadTabMap.delete(downloadItem.id);

            const newDownloadId = await browser.downloads.download({
                url: downloadItem.url,
                filename: folderPath
            });

            downloadTabMap.set(newDownloadId, { url: currentUrl, tabId: tabId });
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

            const tabInfo = downloadTabMap.get(downloadDelta.id);

            if (!tabInfo) {
                console.log("⚠ ページ情報が見つかりませんでした");
                return;
            }

            const pageUrl = tabInfo.url;
            const tabId = tabInfo.tabId;

            console.log("ダウンロード元ページ:", pageUrl);

            if (!isFanzaWork(pageUrl)) {
                console.log("- Fanza作品ではありません");
                downloadTabMap.delete(downloadDelta.id);
                return;
            }

            console.log("✓ Fanza作品を検知");

            const workId = extractWorkId(pageUrl);

            if (!workId) {
                console.log("⚠ 作品IDを抽出できませんでした");
                console.log("   URL:", pageUrl);
                downloadTabMap.delete(downloadDelta.id);
                return;
            }

            console.log("作品ID:", workId);
            await saveWorkInfo(workId, pageUrl, download.filename, tabId);

            downloadTabMap.delete(downloadDelta.id);

        } catch (error) {
            console.error("エラー:", error);
        }
    }
});