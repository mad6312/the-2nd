/**
 * The 2nd - クライアント側メインスクリプト
 */
const socket = io();

// DOM要素の参照
const viewLobby = document.getElementById('view-lobby');
const viewGame = document.getElementById('view-game');
const viewRoundResult = document.getElementById('view-round-result');
const viewFinalResult = document.getElementById('view-final-result');

// ヘッダー・設定モーダル関連
const headerPlayerName = document.getElementById('header-player-name');
const btnOpenSettings = document.getElementById('btn-open-settings');
const modalSettings = document.getElementById('modal-settings');
const settingsPlayerNameInput = document.getElementById('settings-player-name');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const hostGameControlArea = document.getElementById('host-game-control-area');
const btnForceEndGame = document.getElementById('btn-force-end-game');

// ロビー要素
const lobbyPlayerCount = document.getElementById('lobby-player-count');
const lobbyMyStatus = document.getElementById('lobby-my-status');
const lobbyModeDisplay = document.getElementById('lobby-mode-display');
const hostModeControlWrap = document.getElementById('host-mode-control-wrap');
const btnModeStandard = document.getElementById('btn-mode-standard');
const btnModeEndless = document.getElementById('btn-mode-endless');
const modeExplanationText = document.getElementById('mode-explanation-text');
const btnToggleJoin = document.getElementById('btn-toggle-join');
const btnStartGame = document.getElementById('btn-start-game');
const joinedCountBadge = document.getElementById('joined-count-badge');
const lobbyPlayersList = document.getElementById('lobby-players-list');

// メインゲーム画面要素
const opponentsContainer = document.getElementById('opponents-container');
const gameRoundIndicator = document.getElementById('game-round-indicator');
const gameModeIndicator = document.getElementById('game-mode-indicator');
const currentTopicText = document.getElementById('current-topic-text');
const myPodName = document.getElementById('my-pod-name');
const myPodScore = document.getElementById('my-pod-score');
const myStatusLamp = document.getElementById('my-status-lamp');
const inputAnswer = document.getElementById('input-answer');
const btnSubmitAnswer = document.getElementById('btn-submit-answer');
const mySubmittedAnswerBox = document.getElementById('my-submitted-answer-box');
const submittedAnswerText = document.getElementById('submitted-answer-text');

// ラウンドリザルト画面要素
const resultRoundBadge = document.getElementById('result-round-badge');
const resultTopicText = document.getElementById('result-topic-text');
const resultReadyLamps = document.getElementById('result-ready-lamps');
const aiSummaryText = document.getElementById('ai-summary-text');
const roundResultList = document.getElementById('round-result-list');
const btnNextRound = document.getElementById('btn-next-round');

// 最終結果画面要素
const winnerNameDisplay = document.getElementById('winner-name-display');
const winnerReasonDesc = document.getElementById('winner-reason-desc');
const finalStandingsList = document.getElementById('final-standings-list');
const btnFinalRematch = document.getElementById('btn-final-rematch');
const btnFinalLeave = document.getElementById('btn-final-leave');

// AI詳細解説モーダル要素
const modalExplanation = document.getElementById('modal-explanation');
const modalExpRankBadge = document.getElementById('modal-exp-rank-badge');
const modalExpCanonicalName = document.getElementById('modal-exp-canonical-name');
const modalExpRawAnswer = document.getElementById('modal-exp-raw-answer');
const modalExpPlayerName = document.getElementById('modal-exp-player-name');
const modalExpText = document.getElementById('modal-exp-text');
const btnCloseExplanation = document.getElementById('btn-close-explanation');

// トースト通知要素
const toastElement = document.getElementById('toast');
let toastTimer = null;

// 現在のクライアント状態キャッシュ
let currentState = null;

// ==========================================================================
// 画面切り替えユーティリティ
// ==========================================================================
function switchView(targetView) {
    [viewLobby, viewGame, viewRoundResult, viewFinalResult].forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    targetView.classList.remove('hidden');
    targetView.classList.add('active');
}

function showToast(message) {
    if (!toastElement) return;
    toastElement.textContent = message;
    toastElement.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastElement.classList.add('hidden');
    }, 3500);
}

// ==========================================================================
// Socket.IO 受信ハンドラ
// ==========================================================================
socket.on('stateUpdate', (data) => {
    currentState = data;
    const { self, room } = data;

    headerPlayerName.textContent = self.name;

    // 設定モーダル内の「ゲームを終了」ボタン制御（ホストかつゲーム進行中のみ表示）
    if (self.isHost && (self.viewState === 'GAME' || self.viewState === 'ROUND_RESULT')) {
        hostGameControlArea.classList.remove('hidden');
    } else {
        hostGameControlArea.classList.add('hidden');
    }

    // 画面遷移振り分け
    if (self.viewState === 'LOBBY') {
        switchView(viewLobby);
        renderLobby(self, room);
    } else if (self.viewState === 'GAME') {
        switchView(viewGame);
        renderGameStage(self, room);
    } else if (self.viewState === 'ROUND_RESULT') {
        switchView(viewRoundResult);
        renderRoundResult(self, room);
    } else if (self.viewState === 'FINAL_RESULT') {
        switchView(viewFinalResult);
        renderFinalResult(self, room);
    }
});

socket.on('errorMessage', (msg) => {
    showToast(msg);
});

// ==========================================================================
// 画面1: ロビー描画ロジック（モード切替）
// ==========================================================================
function renderLobby(self, room) {
    lobbyPlayerCount.textContent = `${room.joinedCount} / ${room.maxPlayers}名`;
    joinedCountBadge.textContent = room.joinedCount;

    // ゲームモード表示の更新
    const isEndless = (room.gameMode === 'ENDLESS');
    lobbyModeDisplay.textContent = isEndless ? 'エンドレス' : 'スタンダード';
    lobbyModeDisplay.className = isEndless ? 'badge badge-green' : 'badge badge-gold';

    // ホスト専用モード切り替えパネルの制御
    if (self.isHost) {
        hostModeControlWrap.classList.remove('hidden');
        btnModeStandard.classList.toggle('active', !isEndless);
        btnModeEndless.classList.toggle('active', isEndless);

        modeExplanationText.textContent = isEndless
            ? `エンドレス: 全お題（全${room.totalTopics}問）が出尽くすまで継続し、最終的な最多ポイント獲得者が優勝となります。`
            : 'スタンダード: 通算3ポイントを先取したプレイヤーが出た時点でゲーム終了・勝利となります。';
    } else {
        hostModeControlWrap.classList.add('hidden');
    }

    // 自分のエントリー状況
    if (self.isJoined) {
        lobbyMyStatus.textContent = "参加中...";
        lobbyMyStatus.className = "badge badge-green";
        btnToggleJoin.textContent = "参加キャンセル";
        btnToggleJoin.className = "btn btn-secondary btn-large";
    } else {
        lobbyMyStatus.textContent = "未エントリー";
        lobbyMyStatus.className = "badge badge-gray";
        btnToggleJoin.textContent = "参加する";
        btnToggleJoin.className = "btn btn-primary btn-large";
    }

    // ホストのゲーム開始ボタン
    if (self.isHost && self.isJoined) {
        btnStartGame.classList.remove('hidden');
        btnStartGame.disabled = room.joinedCount < room.minPlayers;
        btnStartGame.textContent = room.joinedCount < room.minPlayers
            ? `待機中 (${room.joinedCount}/${room.minPlayers}名〜)`
            : `ゲーム開始 (${room.joinedCount}名)`;
    } else {
        btnStartGame.classList.add('hidden');
    }

    // エントリー中のプレイヤーリスト
    lobbyPlayersList.innerHTML = '';
    room.lobbyPlayers.forEach(p => {
        const chip = document.createElement('div');
        chip.className = `lobby-player-chip ${p.isHost ? 'is-host' : ''}`;
        chip.innerHTML = `
      <span class="chip-name">${escapeHtml(p.name)}</span>
      ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
    `;
        lobbyPlayersList.appendChild(chip);
    });
}

// ==========================================================================
// 画面2: メインゲーム画面
// ==========================================================================
function renderGameStage(self, room) {
    gameRoundIndicator.textContent = `ROUND ${room.round}`;
    gameModeIndicator.textContent = (room.gameMode === 'ENDLESS') ? '♾️ エンドレス' : '🏆 スタンダード';
    currentTopicText.textContent = room.topic || 'お題取得中...';

    myPodName.textContent = self.name;
    myPodScore.textContent = self.points;

    if (self.isReady) {
        myStatusLamp.textContent = "回答済";
        myStatusLamp.className = "status-lamp on";
        inputAnswer.disabled = true;
        btnSubmitAnswer.disabled = true;
        mySubmittedAnswerBox.classList.remove('hidden');
        submittedAnswerText.textContent = self.currentAnswer;
    } else {
        myStatusLamp.textContent = "未完了";
        myStatusLamp.className = "status-lamp off";
        inputAnswer.disabled = false;
        btnSubmitAnswer.disabled = inputAnswer.value.trim().length === 0;
        mySubmittedAnswerBox.classList.add('hidden');
    }

    opponentsContainer.innerHTML = '';
    const opponents = room.gamePlayers.filter(p => p.id !== self.id);

    opponents.forEach(opp => {
        const oppCard = document.createElement('div');
        oppCard.className = `opponent-card ${opp.isReady ? 'ready-active' : ''}`;
        oppCard.innerHTML = `
      <div class="opp-top-row">
        <span class="opp-name">${escapeHtml(opp.name)}</span>
        <span class="opp-pts">${opp.points} pts</span>
      </div>
      <div class="opp-bottom-row">
        <span class="status-lamp ${opp.isReady ? 'on' : 'off'}">
          ${opp.isReady ? '回答済' : '考え中...'}
        </span>
      </div>
    `;
        opponentsContainer.appendChild(oppCard);
    });
}

// ==========================================================================
// 画面3: ラウンドリザルト画面
// ==========================================================================
function renderRoundResult(self, room) {
    const resultData = room.lastRoundResults;
    if (!resultData) return;

    resultRoundBadge.textContent = `ROUND ${resultData.round} 結果`;
    resultTopicText.textContent = resultData.topic;
    aiSummaryText.textContent = resultData.summaryComment || '集計が完了しました。';

    resultReadyLamps.innerHTML = '';
    room.gamePlayers.forEach(p => {
        const pill = document.createElement('div');
        pill.className = `mini-ready-pill ${p.isReady ? 'ready' : ''}`;
        pill.innerHTML = `
      <span class="status-lamp ${p.isReady ? 'on' : 'off'}"></span>
      <span>${escapeHtml(p.name)}</span>
    `;
        resultReadyLamps.appendChild(pill);
    });

    if (self.isReady) {
        btnNextRound.textContent = "他のプレイヤーの準備を待機中...";
        btnNextRound.disabled = true;
        btnNextRound.className = "btn btn-secondary btn-large";
    } else {
        btnNextRound.textContent = "次へ進む（準備完了）";
        btnNextRound.disabled = false;
        btnNextRound.className = "btn btn-accent btn-large";
    }

    roundResultList.innerHTML = '';
    resultData.items.forEach(item => {
        const row = document.createElement('div');
        const is2nd = item.earnedPoint > 0;
        row.className = `grid-row-item ${is2nd ? 'highlight-2nd' : ''}`;

        let rankBadgeClass = item.isExcluded ? 'rank-indicator rank-excluded' : (is2nd ? 'rank-indicator rank-2nd' : 'rank-indicator');
        const pointAnimHtml = is2nd ? `<span class="pts-plus-anim">+1 pt!</span>` : '';

        row.innerHTML = `
      <div class="grid-col col-player">
        <div class="${rankBadgeClass}">${item.isExcluded ? '失格' : item.rank}</div>
        <div class="player-score-meta">
          <span class="p-name">${escapeHtml(item.playerName)}</span>
          <span class="p-pts-count">総得点: <strong>${item.totalPoints}</strong> pts ${pointAnimHtml}</span>
        </div>
      </div>
      <div class="grid-col col-answer">
        <button class="answer-clickable-badge">
          <span>💬 ${escapeHtml(item.answerText)}</span>
          <span class="view-exp-hint">▶ 解説</span>
        </button>
      </div>
    `;

        const answerBtn = row.querySelector('.answer-clickable-badge');
        answerBtn.addEventListener('click', () => {
            openExplanationModal(item);
        });

        roundResultList.appendChild(row);
    });
}

// ==========================================================================
// 画面4: 最終対戦結果画面
// ==========================================================================
function renderFinalResult(self, room) {
    const standings = room.finalStandings || [];
    if (standings.length === 0) return;

    const winners = standings.filter(s => s.isWinner);
    const winnerNames = winners.map(w => escapeHtml(w.playerName)).join(' & ');
    winnerNameDisplay.textContent = winnerNames || '対戦終了';

    if (room.gameMode === 'ENDLESS') {
        winnerReasonDesc.textContent = "お題全問制覇！最多ポイントを獲得し、2位マスターに輝きました！";
    } else {
        winnerReasonDesc.textContent = "見事 3ポイント を獲得し、2位マスターに輝きました！";
    }

    finalStandingsList.innerHTML = '';
    standings.forEach(item => {
        const row = document.createElement('div');
        row.className = `standing-row ${item.isWinner ? 'is-winner-row' : ''}`;
        row.innerHTML = `
      <div class="standing-left">
        <span class="standing-rank">${item.isWinner ? '👑 1位' : `${item.rank}位`}</span>
        <strong class="standing-player-name">${escapeHtml(item.playerName)}</strong>
      </div>
      <div class="standing-right">
        <span class="badge ${item.isWinner ? 'badge-gold' : 'badge-gray'}">${item.points} pts</span>
      </div>
    `;
        finalStandingsList.appendChild(row);
    });
}

// ==========================================================================
// モーダル操作・イベントリスナー
// ==========================================================================

function openExplanationModal(item) {
    modalExpRankBadge.textContent = item.isExcluded ? '除外（失格）' : `第${item.rank}位`;
    modalExpRankBadge.className = `badge ${item.isExcluded ? 'badge-gray' : (item.earnedPoint > 0 ? 'badge-green' : 'badge-gold')}`;
    modalExpCanonicalName.textContent = item.normalizedCanonicalName || item.answerText;
    modalExpRawAnswer.textContent = item.answerText;
    modalExpPlayerName.textContent = item.playerName;
    modalExpText.textContent = item.explanation || '解説はありません。';

    modalExplanation.classList.remove('hidden');
}

btnCloseExplanation.addEventListener('click', () => {
    modalExplanation.classList.add('hidden');
});

// プレイヤー設定モーダル開閉
btnOpenSettings.addEventListener('click', () => {
    if (currentState && currentState.self) {
        settingsPlayerNameInput.value = currentState.self.name;
        // ゲーム進行中かつホストのみ強制終了ボタンを表示
        if (currentState.self.isHost && (currentState.self.viewState === 'GAME' || currentState.self.viewState === 'ROUND_RESULT')) {
            hostGameControlArea.classList.remove('hidden');
        } else {
            hostGameControlArea.classList.add('hidden');
        }
    }
    modalSettings.classList.remove('hidden');
    settingsPlayerNameInput.focus();
});

btnCloseSettings.addEventListener('click', () => {
    modalSettings.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', () => {
    const newName = settingsPlayerNameInput.value.trim();
    if (newName) {
        socket.emit('updateName', newName);
    }
    modalSettings.classList.add('hidden');
});

// ホスト専用：ゲーム強制終了ボタン
btnForceEndGame.addEventListener('click', () => {
    if (confirm("現在のポイントと順位でゲームを終了し、最終リザルト画面へ遷移しますか？")) {
        socket.emit('forceEndGame');
        modalSettings.classList.add('hidden');
    }
});

// ホスト専用：モード切り替えボタン
btnModeStandard.addEventListener('click', () => {
    socket.emit('setGameMode', 'STANDARD');
});

btnModeEndless.addEventListener('click', () => {
    socket.emit('setGameMode', 'ENDLESS');
});

// ロビーアクション
btnToggleJoin.addEventListener('click', () => {
    socket.emit('toggleJoin');
});

btnStartGame.addEventListener('click', () => {
    socket.emit('startGame');
});

// 回答入力制御
inputAnswer.addEventListener('input', () => {
    const val = inputAnswer.value.trim();
    btnSubmitAnswer.disabled = val.length === 0;
});

inputAnswer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnSubmitAnswer.disabled) {
        btnSubmitAnswer.click();
    }
});

btnSubmitAnswer.addEventListener('click', () => {
    const answer = inputAnswer.value.trim();
    if (!answer) return;

    socket.emit('submitAnswer', answer);
    inputAnswer.value = '';
    btnSubmitAnswer.disabled = true;
});

btnNextRound.addEventListener('click', () => {
    socket.emit('nextRoundReady');
    btnNextRound.disabled = true;
});

btnFinalRematch.addEventListener('click', () => {
    socket.emit('rematch');
});

btnFinalLeave.addEventListener('click', () => {
    socket.emit('leaveToLobby');
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}