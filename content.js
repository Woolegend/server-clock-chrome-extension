// IIFE
(async function () {
  const ROOT_ID = "server-time-pip";
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

  const uiContainer = document.createElement("div");
  uiContainer.id = ROOT_ID;

  /**
   * --- 저장된 PIP 위치 불러오기/적용 ---
   * 이전 위치가 저장되어 있다면 불러와서 적용.
   */
  const storedPos = await chrome.storage.local.get("pipPosition");
  if (storedPos.pipPosition) {
    uiContainer.style.left = storedPos.pipPosition.x;
    uiContainer.style.top = storedPos.pipPosition.y;
    uiContainer.style.right = "auto";
  }

  // PIP UI 드래그(이동)을 위한 핸들 컴포넌트
  const serverTimePipHandle = document.createElement("div");
  serverTimePipHandle.id = "server-time-pip-handle";
  serverTimePipHandle.textContent = ":: 드래그 ::";

  /** 전체 컨텐츠 랩퍼 */
  const serverTimePipContent = document.createElement("div");
  serverTimePipContent.id = "server-time-pip-content";
  serverTimeHeadTitle = document.createElement("h1");
  serverTimeHeadTitle.textContent = "서버 시간 확인기";

  /** 입력 필드와 관련 요소를 감싸는 그룹 */
  const inputGroup = document.createElement("div");
  inputGroup.className = "input-group";

  /** URL 입력 필드 */
  const urlInputField = document.createElement("input");
  urlInputField.type = "text";
  urlInputField.id = "url-input";
  urlInputField.placeholder = "https://nol.interpark.com";

  /** 서버 시간 확인 버튼 */
  const checkButton = document.createElement("button");
  checkButton.id = "check-btn";
  checkButton.textContent = "확인";
  inputGroup.appendChild(urlInputField);
  inputGroup.appendChild(checkButton);

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

  serverTimePipContent.appendChild(serverTimeHeadTitle);
  serverTimePipContent.appendChild(inputGroup);
  serverTimePipContent.appendChild(resultArea);
  serverTimePipContent.appendChild(statusMessage);

  uiContainer.appendChild(serverTimePipHandle);
  uiContainer.appendChild(serverTimePipContent);

  // 웹페이지의 body에 UI를 추가합니다.
  document.body.appendChild(uiContainer);

  // --- 2. 드래그 로직 추가 ---
  const handle = document.getElementById("server-time-pip-handle");
  let isDragging = false;
  let offset = { x: 0, y: 0 };

  // 마우스 버튼을 눌렀을 때 (드래그 시작)
  handle.addEventListener("mousedown", (e) => {
    isDragging = true;

    // 현재 마우스 위치와 창의 왼쪽 상단 모서리 사이의 간격 계산
    offset.x = e.clientX - uiContainer.offsetLeft;
    offset.y = e.clientY - uiContainer.offsetTop;
    // 드래그 중 텍스트가 선택되는 것을 방지
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    // 마우스 위치에서 간격을 빼서 창의 새 위치 계산
    let newX = e.clientX - offset.x;
    let newY = e.clientY - offset.y;
    uiContainer.style.left = `${newX}px`;
    uiContainer.style.top = `${newY}px`;
  });

  // 마우스 버튼을 뗐을 때 (드래그 종료)
  document.addEventListener("mouseup", () => {
    isDragging = false;
    // 텍스트 선택 방지 해제
    document.body.style.userSelect = "";
  });

  // --- 3. 서버 시간 확인 로직 (기존 popup.js와 동일) ---
  // UI 요소들을 가져옵니다. (document.getElementById 사용 가능)
  const urlInput = document.getElementById("url-input");
  const checkBtn = document.getElementById("check-btn");
  const timeDisplay = document.getElementById("server-time-display");
  const statusMsg = document.getElementById("status-message");
  let clockInterval = null;

  checkBtn.addEventListener("click", () => {
    const url = urlInput.value;
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

// https://hyung1.tistory.com/77
