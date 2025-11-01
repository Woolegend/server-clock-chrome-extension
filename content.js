// IIFE
(async function () {
  const ROOT_ID = "server-clock";
  /**
   * --- 1. UI 토글 및 생성 ---
   * 이미 UI가 렌더링 되었다면 토글만 하고 종료.
   * 없다면 아래 로직을 실행해 UI를 생성.
   */
  const existingUI = document.getElementById(ROOT_ID);
  if (existingUI) {
    existingUI.style.display =
      existingUI.style.display === "none" ? "block" : "none";
    return;
  }

  const container = document.createElement("div");
  container.id = ROOT_ID;

  /**
   * ANCHOR 드래그 핸들
   */
  const handle = document.createElement("div");
  handle.id = "server-clock-handle";
  handle.textContent = ":: 드래그 ::";

  const storedPos = await chrome.storage.local.get("pipPosition");
  if (storedPos.pipPosition) {
    container.style.left = storedPos.pipPosition.x;
    container.style.top = storedPos.pipPosition.y;
    container.style.right = "auto";
  }

  let isDragging = false;
  let offset = { x: 0, y: 0 };

  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    offset.x = e.clientX - container.offsetLeft;
    offset.y = e.clientY - container.offsetTop;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    // 마우스 위치에서 간격을 빼서 창의 새 위치 계산
    let newX = e.clientX - offset.x;
    let newY = e.clientY - offset.y;
    container.style.left = `${newX}px`;
    container.style.top = `${newY}px`;
  });

  // 마우스 버튼을 뗐을 때 (드래그 종료)
  document.addEventListener("mouseup", () => {
    isDragging = false;
    // 텍스트 선택 방지 해제
    document.body.style.userSelect = "";
  });

  /**
   * ANCHOR 메인 컨텐츠 랩퍼
   */
  const contentWrapper = document.createElement("div");
  contentWrapper.id = "server-time-pip-content";
  const headTitle = document.createElement("h1");
  headTitle.textContent = "서버 시간 확인기";

  /**
   * ANCHOR 입력 관련 요소
   */
  const inputGroup = document.createElement("div");
  inputGroup.className = "input-group";

  const inputField = document.createElement("input");
  inputField.type = "text";
  inputField.id = "input-url";
  inputField.placeholder = "https://naver.com";

  const checkButton = document.createElement("button");
  checkButton.id = "check-btn";
  checkButton.textContent = "확인";
  inputGroup.appendChild(inputField);
  inputGroup.appendChild(checkButton);

  const recommandedSites = [
    { name: "네이버", url: "https://www.naver.com" },
    { name: "티켓링크", url: "https://www.ticketlink.co.kr/home" },
    { name: "인터파크", url: "https://nol.interpark.com/" },
  ];

  const favoritesContainer = document.createElement("div");
  favoritesContainer.id = "server-time-pip-favorites";

  recommandedSites.forEach((site) => {
    const btn = document.createElement("button");
    btn.className = "fav-btn";
    btn.title = `${site.name} (${site.url})`;

    const img = document.createElement("img");
    img.src = `https://www.google.com/s2/favicons?domain=${site.url}&sz=16`;
    img.alt = site.name;

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      inputField.value = site.url;
      checkBtn.click(); // '확인' 버튼을 코드로 클릭
    });

    favoritesContainer.appendChild(btn);
  });

  /** 서버 시간 결과를 표시하는 영역 */
  const resultArea = document.createElement("div");
  resultArea.id = "result-area";

  /** 실제 서버 시간 텍스트 표시 요소 */
  const serverTimeDisplay = document.createElement("p");
  serverTimeDisplay.id = "server-time-display";
  serverTimeDisplay.textContent = "... ⏱️";
  resultArea.appendChild(serverTimeDisplay);

  /** 상태 메시지 표시 요소 */
  const statusMessage = document.createElement("p");
  statusMessage.className = "status";
  statusMessage.id = "status-message";

  contentWrapper.appendChild(headTitle);
  contentWrapper.appendChild(inputGroup);
  contentWrapper.appendChild(favoritesContainer);
  contentWrapper.appendChild(resultArea);
  contentWrapper.appendChild(statusMessage);

  container.appendChild(handle);
  container.appendChild(contentWrapper);

  // 웹페이지의 body에 UI를 추가합니다.
  document.body.appendChild(container);

  // --- 3. 서버 시간 확인 로직 (기존 popup.js와 동일) ---
  // UI 요소들을 가져옵니다. (document.getElementById 사용 가능)
  const checkBtn = document.getElementById("check-btn");
  const timeDisplay = document.getElementById("server-time-display");
  const statusMsg = document.getElementById("status-message");
  let clockInterval = null;

  checkBtn.addEventListener("click", () => {
    const url = document.getElementById("input-url")?.value.trim();

    if (!url) {
      return;
    }

    if (clockInterval) {
      clearInterval(clockInterval);
    }

    if (!url || !url.startsWith("http")) {
      statusMsg.textContent = "올바른 URL을 입력하세요 (예: https://...)";
      statusMsg.className = "status error";
      timeDisplay.textContent = "-";
      return;
    }

    timeDisplay.textContent = "가져오는 중...";
    statusMsg.textContent = "";
    statusMsg.className = "status";

    // background.js로 메시지 전송
    chrome.runtime.sendMessage(
      { action: "fetchServerTime", url: url },
      (response) => {
        if (response.status === "success") {
          const serverDate = new Date(response.timeGMT);
          const clientDate = new Date();
          const offset = serverDate.getTime() - clientDate.getTime();

          statusMsg.textContent = `기준 시간: ${serverDate.toLocaleString(
            "ko-KR"
          )}`;
          statusMsg.className = "status success";
          startTickingClock(offset); // 기존 시계 로직 실행
        } else {
          // background에서 오류가 발생한 경우
          console.error("오류:", response.message);
          timeDisplay.textContent = "가져오기 실패";
          statusMsg.textContent = "오류: " + response.message;
          statusMsg.className = "status error";
        }
      }
    );
  });

  function startTickingClock(offset) {
    function updateClock() {
      const now = new Date();
      const currentServerTime = new Date(now.getTime() + offset);
      const timeString = currentServerTime.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      timeDisplay.textContent = timeString;
    }

    updateClock(); // 즉시 1회 실행
    clockInterval = setInterval(updateClock, 1000); // 1초마다 실행
  }
})(); // 즉시 실행 함수 종료
