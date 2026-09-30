/**
 * TrustedToolsWeb - Meta & SEO Automation Engine
 */

document.addEventListener("DOMContentLoaded", function() {
    // বর্তমান ক্লিন ইউআরএল বের করা
    const fullURL = window.location.href.split(/[?#]/)[0];
    const fileName = window.location.pathname.split("/").pop() || "index.html";

    // ১. ক্যানোনিকাল (Canonical) আপডেট
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', fullURL);

    // ২. অথর (Author) আপডেট
    let authorTag = document.querySelector('meta[name="author"]');
    if (authorTag) authorTag.setAttribute('content', SITE_CONFIG.author);

    // ইমেজ পাথ ফিক্স করা (যদি আগে থেকে http থাকে, তবে নতুন করে baseUrl যোগ করবে না)
    let currentOgImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || SITE_CONFIG.defaultOGImage;
    let finalOgImg = currentOgImg.startsWith('http') ? currentOgImg : SITE_CONFIG.baseUrl + "/" + currentOgImg;

    let currentTwImg = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || SITE_CONFIG.defaultOGImage;
    let finalTwImg = currentTwImg.startsWith('http') ? currentTwImg : SITE_CONFIG.baseUrl + "/" + currentTwImg;

    // ৩. সোশ্যাল মিডিয়া (OG & Twitter) ডেটা ম্যাপিং
    const metaMap = {
        'og:url': fullURL,
        'og:site_name': SITE_CONFIG.ogSiteName,
        'og:image': finalOgImg,
        'twitter:url': fullURL,
        'twitter:site': SITE_CONFIG.twitterHandle,
        'twitter:creator': SITE_CONFIG.twitterHandle,
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
                    data.author.name = SITE_CONFIG.author;
                    data.author.url = SITE_CONFIG.baseUrl;
                } else {
                    data.author = SITE_CONFIG.author; // যদি স্ট্রিং হয়
                }
            }
            
            if (data.brand) {
                data.brand.name = SITE_CONFIG.brandName;
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