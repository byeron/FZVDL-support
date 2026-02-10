// Fanzaの作品URLかチェックする関数
function isFanzaWork(url) {
    return url && (
        url.includes('dmm.co.jp') || url.includes('dmm.com')
    ) && (
            url.includes('/mylibrary/detail/') ||
            url.includes('/detail/') /* ||
            url.includes('=/cid=')
            */
        );
}

// URLから作品IDを抽出する関数, 作品ページの処理は一時的に停止
function extractWorkId(url) {
    // 購入済みページのurl
    let match = url.match(/product_id=([^/&]+)/);
    if (match) {
        return match[1];
    }

    // 作品ページのurl
    /*
    match = url.match(/cid=([^/&]+)/);
    if (match) {
        return match[1];
    }
    */

    return null;
}

// 作品がダウンロード済みかチェックする関数
async function isWorkDownloaded(workId) {
    const result = await browser.storage.local.get('works');
    const works = result.works || [];
    return works.some(w => w.id === workId);  // 条件に合う要素が存在するかどうか
}
