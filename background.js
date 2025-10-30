// background.js

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["content.css"],
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchServerTime") {
    (async () => {
      try {
        const response = await fetch(request.url, { method: "HEAD" });
        const serverTimeGMT = response.headers.get("Date");

        if (serverTimeGMT) {
          sendResponse({ status: "success", timeGMT: serverTimeGMT });
        } else {
          throw new Error("Date 헤더를 찾을 수 없습니다.");
        }
      } catch (error) {
        sendResponse({ status: "error", message: error.message });
      }
    })();
    return true; // 비동기 응답
  }
});
