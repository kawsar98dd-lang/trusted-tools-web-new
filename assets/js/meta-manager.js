/**
 * TrustedToolsWeb - Meta & SEO Automation Engine
 */

document.addEventListener("DOMContentLoaded", function() {
    // বর্তমান ক্লিন ইউআরএল বের করা
    // Canonical URL = cfg.baseUrl + clean path (no .html, no index.html, no trailing slash)
    const cfg = window.SITE_CONFIG || {};
    const baseUrl = (cfg.baseUrl || window.location.origin).replace(/\/+$/, '');
    let cleanPath = window.location.pathname
        .replace(/\/index\.html$/, '/')
        .replace(/\.html$/, '');
    if (cleanPath.length > 1) cleanPath = cleanPath.replace(/\/+$/, '');
    const fullURL = baseUrl + (cleanPath === '/' ? '/' : cleanPath);
    const fileName = window.location.pathname.split("/").pop() || "index.html";

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', fullURL);

    // Author
    let authorTag = document.querySelector('meta[name="author"]');
    if (authorTag) authorTag.setAttribute('content', cfg.author);

    // Resolve image URLs to absolute (relative values are treated as relative to the site root)
    const toAbs = (u) => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        return baseUrl + "/" + u.replace(/^(\.\.\/|\.\/|\/)+/, '');
    };
    let finalOgImg = toAbs(document.querySelector('meta[property="og:image"]')?.getAttribute('content') || cfg.defaultOGImage);
    let finalTwImg = toAbs(document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || cfg.defaultOGImage);

    const metaMap = {
        'og:url': fullURL,
        'og:site_name': cfg.ogSiteName,
        'og:image': finalOgImg,
        'twitter:url': fullURL,
        'twitter:site': cfg.twitterHandle,
        'twitter:creator': cfg.twitterHandle,
        'twitter:image': finalTwImg
    };

    // লুপ চালিয়ে মেটা ট্যাগগুলো আপডেট করা
    for (let property in metaMap) {
        let tag = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
        if (tag) tag.setAttribute('content', metaMap[property]);
    }

    // ৪. স্কিমা (JSON-LD) অটোমেশন
    const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
    schemaScripts.forEach(script => {
        try {
            let data = JSON.parse(script.innerText);
            
            if (data.url) data.url = fullURL;
            
            if (data.author) {
                if (typeof data.author === 'object') {
                    data.author.name = cfg.author;
                    data.author.url = cfg.baseUrl;
                } else {
                    data.author = cfg.author; // যদি স্ট্রিং হয়
                }
            }
            
            if (data.brand) {
                data.brand.name = cfg.brandName;
            }

            // আপডেটেড ডাটা আবার স্ক্রিপ্টে বসিয়ে দেওয়া
            script.innerText = JSON.stringify(data, null, 2);
        } catch (err) {
            console.error("Schema sync error:", err);
        }
    });

    console.log("🚀 SEO & Schema synced for: " + fileName);
});

/* How to Re-brand the entire project?
All tools are connected to a central configuration.
Open assets/js/site-config.js.
Change brandName, author, and baseUrl.
Your changes will reflect on all 100+ pages instantly, including SEO Canonical links and JSON-LD Schema.
No need to touch individual HTML files. */