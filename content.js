console.log("Content script loaded.");

/**
 * 간단한 이벤트 발행기(EventEmitter) 클래스입니다.
 * Model과 View가 Controller에게 변경 사항을 알리는 데 사용됩니다.
 */
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(eventName, listener) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(listener);
  }

  emit(eventName, ...args) {
    const eventListeners = this.events[eventName];
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }
  }
}

// --- 1. Model ---
// 데이터와 비즈니스 로직을 관리합니다.
// (UI나 DOM에 대해 전혀 알지 못합니다)
class ServerTimeModel extends EventEmitter {
  constructor() {
    super();
    this.url = "";
    this.offset = 0;
    this.clockInterval = null;
    this.status = { message: "", type: "" };
  }

  stopClock() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  startClock() {
    this.stopClock(); // 기존 시계 중지
    this._tick(); // 즉시 1회 실행

    this.clockInterval = setInterval(() => {
      this._tick();
    }, 1000);
  }

  _tick() {
    const now = new Date();
    const currentServerTime = new Date(now.getTime() + this.offset);
    const timeString = currentServerTime.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // 'timeUpdated' 이벤트를 발행(emit)하여 Controller에게 알림
    this.emit("timeUpdated", timeString);
  }

  setStatus(message, type = "") {
    this.status = { message, type };
    // 'statusChanged' 이벤트를 발행하여 Controller에게 알림
    this.emit("statusChanged", this.status);
  }

  async fetchServerTime(url) {
    this.stopClock();
    this.url = url;

    if (!this.url || !this.url.startsWith("http")) {
      this.setStatus("올바른 URL을 입력하세요 (예: https://...)", "error");
      this.emit("timeUpdated", "-");
      return;
    }

    this.setStatus("가져오는 중...", "");
    this.emit("timeUpdated", "가져오는 중...");

    // background.js에 시간 요청
    chrome.runtime.sendMessage(
      { action: "fetchServerTime", url: this.url },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("오류:", chrome.runtime.lastError.message);
          this.setStatus("오류: " + chrome.runtime.lastError.message, "error");
          this.emit("timeUpdated", "가져오기 실패");
          return;
        }

        if (response.status === "success") {
          const serverDate = new Date(response.timeGMT);
          const clientDate = new Date();
          this.offset = serverDate.getTime() - clientDate.getTime();
          this.setStatus(
            `기준 시간: ${serverDate.toLocaleString("ko-KR")}`,
            "success"
          );
          this.startClock();
        } else {
          console.error("오류:", response.message);
          this.setStatus("오류: " + response.message, "error");
          this.emit("timeUpdated", "가져오기 실패");
        }
      }
    );
  }
}

// --- 2. View ---
// DOM 요소의 생성, 렌더링, 조작을 담당합니다.
// (로직이나 데이터 상태를 알지 못합니다)
class ServerTimeView extends EventEmitter {
  constructor(rootId) {
    super();
    this.rootId = rootId;
    this.recommandedData = [
      { name: "네이버", url: "https://www.naver.com" },
      { name: "티켓링크", url: "https://www.ticketlink.co.kr" },
      { name: "인터파크", url: "https://nol.interpark.com/" },
    ];

    // UI의 핵심 DOM 요소들
    this.container = null;
    this.inputField = null;
    this.checkButton = null;
    this.timeDisplay = null;
    this.statusMessage = null;
  }

  /**
   * UI가 이미 존재하는지 확인하고, 토글합니다.
   * @returns {boolean} UI가 이미 존재했으면 true, 아니면 false
   */
  toggleExistingUI() {
    const existingUI = document.getElementById(this.rootId);
    if (existingUI) {
      existingUI.style.display =
        existingUI.style.display === "none" ? "block" : "none";
      return true;
    }
    return false;
  }

  /**
   * 저장된 위치를 불러와 컨테이너에 적용합니다.
   */
  async applyStoredPosition() {
    const storedPos = await chrome.storage.local.get("pipPosition");
    if (storedPos.pipPosition) {
      this.container.style.left = storedPos.pipPosition.x;
      this.container.style.top = storedPos.pipPosition.y;
      this.container.style.right = "auto";
    }
  }

  /**
   * UI의 모든 DOM 요소를 생성하고 body에 추가합니다.
   */
  render() {
    this.container = document.createElement("div");
    this.container.id = this.rootId;

    // 1. 드래그 핸들 생성
    const handle = document.createElement("div");
    handle.id = "stc-handle";
    handle.textContent = ":: 드래그 ::";

    // 2. 메인 컨텐츠 랩퍼
    const content = document.createElement("div");
    content.id = "stc-content";

    // 3. 입력 그룹
    const inputGroup = document.createElement("div");
    inputGroup.id = "stc-input-group";

    this.inputField = document.createElement("input");
    this.inputField.type = "text";
    this.inputField.id = "stc-input-field";
    this.inputField.placeholder = "https://naver.com";

    this.checkButton = document.createElement("button");
    this.checkButton.id = "stc-check-button";
    this.checkButton.textContent = "확인";

    inputGroup.appendChild(this.inputField);
    inputGroup.appendChild(this.checkButton);
    content.appendChild(inputGroup);

    // 4. 즐겨찾기 버튼
    const recommendedWrapper = document.createElement("div");
    recommendedWrapper.id = "stc-recommended-wrapper";

    this.recommandedData.forEach((site) => {
      const btn = document.createElement("button");
      btn.className = "stc-recommended-button";
      btn.title = `${site.name} (${site.url})`;
      btn.dataset.url = site.url; // 클릭 이벤트에서 URL을 참조하기 위해

      const img = document.createElement("img");
      img.src = `https://www.google.com/s2/favicons?domain=${site.url}&sz=16`;
      img.alt = site.name;

      const overlay = document.createElement("div");
      overlay.className = "stc-recommended-button-overlay";

      btn.appendChild(overlay);
      btn.appendChild(img);
      recommendedWrapper.appendChild(btn);
    });
    content.appendChild(recommendedWrapper);

    // 5. 결과 표시 영역
    const resultArea = document.createElement("div");
    resultArea.id = "stc-result-area";

    this.timeDisplay = document.createElement("p");
    this.timeDisplay.id = "stc-time-display";
    this.timeDisplay.textContent = "... ⏱️";
    resultArea.appendChild(this.timeDisplay);

    this.statusMessage = document.createElement("p");
    this.statusMessage.className = "status";
    this.statusMessage.id = "stc-status-message";

    content.appendChild(resultArea);
    content.appendChild(this.statusMessage);

    // 6. 모든 요소를 컨테이너에 조립
    this.container.appendChild(handle);
    this.container.appendChild(content);
    document.body.appendChild(this.container);

    // 7. 이벤트 리스너 바인딩
    this._bindEvents(handle, recommendedWrapper);
  }

  /**
   * DOM 요소에 이벤트 리스너를 연container결하고,
   * Controller에게 알리기 위한 이벤트를 발행(emit)합니다.
   */
  _bindEvents(handle, recommendedWrapper) {
    // '확인' 버튼 클릭
    this.checkButton.addEventListener("click", () => {
      const url = this.inputField.value.trim();
      // 'checkClicked' 이벤트를 발행하여 Controller에게 알림
      this.emit("checkClicked", url);
    });

    // 즐겨찾기 버튼 클릭 (이벤트 위임)
    recommendedWrapper.addEventListener("click", (e) => {
      const btn = e.target.closest(".stc-recommended-button");
      if (btn && btn.dataset.url) {
        // 'recommendedClicked' 이벤트를 발행하여 Controller에게 알림
        this.emit("recommendedClicked", btn.dataset.url);
      }
    });

    // 드래그 로직 (View 자체에서 처리)
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      offset.x = e.clientX - this.container.offsetLeft;
      offset.y = e.clientY - this.container.offsetTop;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      let newX = e.clientX - offset.x;
      let newY = e.clientY - offset.y;
      this.container.style.left = `${newX}px`;
      this.container.style.top = `${newY}px`;
      this.container.style.right = "auto"; // 'right' 속성 충돌 방지
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = "";

      // 'dragEnded' 이벤트를 발행하여 Controller에게 위치 저장 알림
      this.emit("dragEnded", {
        x: this.container.style.left,
        y: this.container.style.top,
      });
    });
  }

  // --- Controller가 호출할 메서드들 ---

  updateTime(timeString) {
    if (this.timeDisplay) {
      this.timeDisplay.textContent = timeString;
    }
  }

  updateStatus({ message, type }) {
    if (this.statusMessage) {
      this.statusMessage.textContent = message;
      this.statusMessage.className = `status ${type}`;
    }
  }

  setInputValue(url) {
    if (this.inputField) {
      this.inputField.value = url;
    }
  }
}

// --- 3. Controller ---
// Model과 View를 연결하는 중재자입니다.
class ServerTimeController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
  }

  /**
   * View와 Model 간의 이벤트 리스너를 설정(바인딩)합니다.
   */
  _bindEvents() {
    // 1. View(UI) -> Model (사용자 입력 처리)

    // '확인' 버튼 클릭 시
    this.view.on("checkClicked", (url) => {
      this.model.fetchServerTime(url);
    });

    // '즐겨찾기' 버튼 클릭 시
    this.view.on("recommendedClicked", (url) => {
      this.view.setInputValue(url); // View의 입력창 업데이트
      this.model.fetchServerTime(url); // Model에 시간 요청
    });

    // '드래그' 종료 시
    this.view.on("dragEnded", (position) => {
      // Model이 아닌 chrome.storage에 직접 저장 (이것은 Model의 데이터가 아님)
      chrome.storage.local.set({ pipPosition: position });
    });

    // 2. Model -> View (데이터 변경 처리)

    // 모델의 시간이 업데이트될 때
    this.model.on("timeUpdated", (timeString) => {
      this.view.updateTime(timeString);
    });

    // 모델의 상태 메시지가 변경될 때
    this.model.on("statusChanged", (status) => {
      this.view.updateStatus(status);
    });
  }

  /**
   * 애플리케이션을 초기화합니다.
   */
  async init() {
    // 1. 기존 UI가 있으면 토글하고 종료
    if (this.view.toggleExistingUI()) {
      return;
    }

    // 2. 새 UI 렌더링
    this.view.render();

    // 3. 저장된 위치 적용
    await this.view.applyStoredPosition();

    // 4. 모든 이벤트 바인딩
    this._bindEvents();
  }
}

// --- 4. Entry Point (시작점) ---
(function () {
  const ROOT_ID = "server-time-clock";

  // 의존성 주입: Model과 View를 생성하여 Controller에 전달
  const model = new ServerTimeModel();
  const view = new ServerTimeView(ROOT_ID);
  const controller = new ServerTimeController(model, view);

  // 애플리케이션 시작
  controller.init();
})();
