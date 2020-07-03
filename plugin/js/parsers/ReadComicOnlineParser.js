"use strict";

parserFactory.register("readcomiconline.to", () => new ReadComicOnlineParser());

/**
 * This one kind of works, 
 * There are issues with site's anti-copy stuff.
 * Usually need to open a first page of chapter before rest will work.
 * Also, sometimes pages return a CAPTCHA
 */
class ReadComicOnlineParser extends Parser{
    constructor() {
        super();
    }

    static extractImageUrls(dom) {
        let prefix = "lstImages.push(\"";
        let script = [...dom.querySelectorAll("script")]
            .map(s => s.textContent)
            .filter(s => s.includes(prefix))[0];
        let urls = [];
        let index = script.indexOf(prefix);
        while(0 < index) {
            index += prefix.length;
            let suffix = script.indexOf("\"", index);
            urls.push(script.substring(index, suffix));
            index = script.indexOf(prefix, suffix);
        }
        return urls;
    }

    async getChapterUrls(dom) {
        let toc = dom.querySelector("table.listing");
        return util.hyperlinksToChapterList(toc).reverse();
    }

    findContent(dom) {
        let content = Parser.findConstrutedContent(dom);
        if (content === null) {
            content = dom.createElement("div");
            content.className = Parser.WEB_TO_EPUB_CLASS_NAME;
            dom.body.appendChild(content);
            let imgUrls = ReadComicOnlineParser.extractImageUrls(dom);
            for(let u of imgUrls) {
                let img = dom.createElement("img");
                img.src = u;
                content.appendChild(img);
            }
        }
        return content;
    }

    extractTitleImpl(dom) {
        return dom.querySelector("a.bigChar").textContent;
    }

    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div#rightside div.barContent");
    }

    async fetchChapter(url) {
        let html = null;
        while (html === null)  {
            html = await ReadComicOnlineParser.tryFetchChapter(url);
        }
        return html;
    }

    static async tryFetchChapter(url) {
        let response = await fetch(url, HttpClient.makeOptions());
        if (response.ok) {
            if (url !== response.url) {
                await ReadComicOnlineParser.doCaptchaRequest(response.url);
                return null;
            }
            let text = await response.text();
            let html =  new DOMParser().parseFromString(text, "text/html");
            util.setBaseTag(response.url, html);
            return html;
        }
        if (response.status === 503) {
            await ReadComicOnlineParser.do503Text(url);
            return null;
        }
    }

    static async doCaptchaRequest(url) {
        await util.createChapterTab(url);
        let errorText = "Site is probably trying to get you to complete a CAPTCHA.\n" +
            " WebToEpub has tried to open a tab to url " + url + "\n" +
            " If tab has not opened, you'll need to open it.\n" +
            " Once open, complete the CAPTCHA, close tab and click the \"Retry\" button above.";
        return ReadComicOnlineParser.promptUserForRetry(errorText);
    }

    static async do503Text(url) {
        await util.createChapterTab(url);
        let errorText = "Site is probably trying to run javascript to avoid DDOS.\n" +
            " WebToEpub has tried to open a tab to url " + url + "\n" +
            " If tab has not opened, you'll need to open it.\n" +
            " Once open, wait for comic book chapter to load. then close tab and click the \"Retry\" button above";
        return ReadComicOnlineParser.promptUserForRetry(errorText);
    }

    static async promptUserForRetry(errorText) {
        let msg = new Error(errorText);
        let cancelLabel = FetchErrorHandler.getCancelButtonText();
        return new Promise(function(resolve, reject) {
            msg.retryAction = () => resolve(true);
            msg.cancelAction = () => reject(false);
            msg.cancelLabel = cancelLabel;
            ErrorLog.showErrorMessage(msg);
        });
    }

    getInformationEpubItemChildNodes(dom) {
        return [dom.querySelector("div.barContent")];
    }
}
