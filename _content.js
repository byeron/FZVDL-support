/* storage.local に格納されたダウンロード済み情報に基づき、Fanzaの My Library の見た目を変更する */

console.log("=== Fanza Download Manager Content Script 起動 ===");

// 作品リストにボーダーを追加する関数
async function updateWorkListBorders() {
    // localListProductzKID2 クラスを持つdiv要素を全て取得
    const workElements = document.querySelectorAll('[class*="localListProduct"]');

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

// ページから作品情報をパースする関数
function parsePageInfo() {
    const info = {
        title: null,
        circle: null,
        releaseDate: null
    };

    try {
        // productDetailInfo を基点として探す
        const detailInfo = document.querySelector('[class*="productDetailInfo"]');

        if (!detailInfo) {
            console.warn("productDetailInfo要素が見つかりませんでした");
            return info;
        }

        // サークル名を取得
        const circleElem = detailInfo.querySelector('[class*="circleName"]');
        if (circleElem) {
            info.circle = circleElem.textContent.trim();
        }

        // 作品名を取得
        const titleElem = detailInfo.querySelector('[class*="productDetailTitle"]');
        if (titleElem) {
            info.title = titleElem.textContent.trim();
        }

        // 配信日を取得
        const updateElem = detailInfo.querySelector('[class*="infoUpdate"]');
        if (updateElem) {
            const textElem = updateElem.querySelector('[class*="text"]');
            if (textElem) {
                const lines = textElem.textContent.split('\n').map(line => line.trim()).filter(line => line);
                if (lines.length >= 2) {
                    info.releaseDate = lines[1]; // 2番目の要素
                }
            }
        }

        console.log("パース成功:", info);

    } catch (error) {
        console.error("ページ情報のパースエラー:", error);
    }

    return info;
}

// background.jsからのリクエストを受け取る
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageInfo') {
        const info = parsePageInfo();
        sendResponse(info);
    }
});