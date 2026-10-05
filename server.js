/**
 * The 2nd - メインサーバー (Express + Socket.IO)
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const topicManager = require('./topics');
const { judgeAnswers } = require('./aiService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const WINNING_POINTS = 3;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

app.use(express.static(path.join(__dirname, 'public')));

/**
 * プレイヤー管理 Map
 */
const clients = new Map();

/**
 * ゲームルーム全体の進行状態
 */
let gameState = {
    phase: 'LOBBY', // 'LOBBY' | 'ANSWERING' | 'JUDGING' | 'ROUND_RESULT'
    gameMode: 'STANDARD', // 'STANDARD' | 'ENDLESS'
    round: 0,
    currentTopic: null,
    hostId: null,
    lastRoundResults: null,
    finalStandings: null
};

/**
 * ホスト（部屋主）の厳格な選出・保護
 */
function updateHost() {
    if (gameState.hostId && clients.has(gameState.hostId)) {
        const currentHostClient = clients.get(gameState.hostId);
        if (currentHostClient.inCurrentGame || currentHostClient.isJoined || currentHostClient.viewState === 'FINAL_RESULT') {
            return;
        }
    }

    const gameActivePlayers = Array.from(clients.values()).filter(c => c.inCurrentGame || c.viewState === 'FINAL_RESULT');
    if (gameActivePlayers.length > 0) {
        gameState.hostId = gameActivePlayers[0].id;
        return;
    }

    const joinedPlayers = Array.from(clients.values()).filter(c => c.isJoined);
    if (joinedPlayers.length > 0) {
        gameState.hostId = joinedPlayers[0].id;
        return;
    }

    gameState.hostId = null;
}

/**
 * 全クライアントへ最新の状態を同期送信
 */
function broadcastState() {
    updateHost();

    const allClientsList = Array.from(clients.values());
    const joinedLobbyPlayers = allClientsList
        .filter(c => c.isJoined)
        .map(c => ({
            id: c.id,
            name: c.name,
            isHost: c.id === gameState.hostId
        }));

    const activeGamePlayers = allClientsList
        .filter(c => c.inCurrentGame)
        .map(c => ({
            id: c.id,
            name: c.name,
            points: c.points,
            prevPoints: c.prevPoints,
            isReady: c.isReady,
            hasAnswered: c.currentAnswer.trim().length > 0
        }));

    for (const [socketId, client] of clients.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) continue;

        socket.emit('stateUpdate', {
            self: {
                id: client.id,
                name: client.name,
                isJoined: client.isJoined,
                inCurrentGame: client.inCurrentGame,
                points: client.points,
                prevPoints: client.prevPoints,
                isReady: client.isReady,
                currentAnswer: client.currentAnswer,
                viewState: client.viewState,
                isHost: client.id === gameState.hostId
            },
            room: {
                phase: gameState.phase,
                gameMode: gameState.gameMode,
                round: gameState.round,
                topic: gameState.currentTopic ? gameState.currentTopic.text : '',
                remainingTopics: topicManager.getRemainingCount(),
                totalTopics: topicManager.getTotalCount(),
                hostId: gameState.hostId,
                joinedCount: joinedLobbyPlayers.length,
                maxPlayers: MAX_PLAYERS,
                minPlayers: MIN_PLAYERS,
                lobbyPlayers: joinedLobbyPlayers,
                gamePlayers: activeGamePlayers,
                lastRoundResults: gameState.lastRoundResults,
                finalStandings: gameState.finalStandings
            }
        });
    }
}

/**
 * AI判定結果に対して採点ルールを適用
 */
function enforceScoringRules(aiData, activePlayers) {
    const results = aiData.results || [];
    const validResults = results.filter(r => !r.isExcluded);

    // 1. 全員がお題不適合で失格となった場合
    if (validResults.length === 0) {
        results.forEach(r => {
            r.rank = 999;
            r.earnedPoint = 0;
            r.explanation = r.explanation || 'お題の条件を満たしていないため除外されました。';
        });
        return {
            results,
            summaryComment: aiData.summaryComment || '全員がお題不適合となったため、このラウンドの得点者はいませんでした。'
        };
    }

    // 2. 表記揺れ統合名ごとに順位を正規化
    const canonicalRankMap = new Map();
    validResults.forEach(r => {
        const key = (r.normalizedCanonicalName || r.answerText).trim().toLowerCase();
        const currentBest = canonicalRankMap.get(key);
        if (currentBest === undefined || r.rank < currentBest) {
            canonicalRankMap.set(key, r.rank);
        }
    });

    const uniqueRawRanks = Array.from(new Set(canonicalRankMap.values())).sort((a, b) => a - b);
    const rankRemap = new Map();
    uniqueRawRanks.forEach((rawRank, idx) => {
        rankRemap.set(rawRank, idx + 1);
    });

    validResults.forEach(r => {
        const key = (r.normalizedCanonicalName || r.answerText).trim().toLowerCase();
        const rawRank = canonicalRankMap.get(key);
        r.rank = rankRemap.get(rawRank);
    });

    // 3. ポイント付与判定
    const distinctRanks = new Set(validResults.map(r => r.rank));
    const isSoleValidGroup = (distinctRanks.size === 1);

    if (isSoleValidGroup) {
        if (activePlayers.length > 1 && validResults.length === activePlayers.length) {
            // 参加者全員が同順位の場合は得点の増加なし (0pt)
            validResults.forEach(r => {
                r.earnedPoint = 0;
            });
        } else {
            // 他が除外され、唯一適合した1名のみの場合 +1pt
            validResults.forEach(r => {
                r.earnedPoint = 1;
            });
        }
    } else {
        // 有効回答が複数ある場合は2位に +1pt
        validResults.forEach(r => {
            r.earnedPoint = (r.rank === 2) ? 1 : 0;
        });
    }

    // 解説文を純粋なAI解説テキストのみにする
    results.forEach(r => {
        if (r.isExcluded) {
            r.rank = 999;
            r.earnedPoint = 0;
        }
        r.explanation = r.explanation || (r.isExcluded ? 'お題の条件を満たしていません。' : `知名度第${r.rank}位と判定されました。`);
    });

    results.sort((a, b) => {
        if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
        return a.rank - b.rank;
    });

    return {
        results,
        summaryComment: aiData.summaryComment || ''
    };
}

/**
 * 新しいラウンドを開始する（エンドレス終了判定を含む）
 */
function startNewRound() {
    const nextTopic = topicManager.getNextTopic(gameState.gameMode);

    if (!nextTopic) {
        // エンドレスモードでお題がすべて出尽くした場合 ➔ 最終結果画面へ
        transitionToFinalResult();
        return;
    }

    gameState.round += 1;
    gameState.phase = 'ANSWERING';
    gameState.currentTopic = nextTopic;
    gameState.lastRoundResults = null;

    for (const client of clients.values()) {
        if (client.inCurrentGame) {
            client.isReady = false;
            client.currentAnswer = '';
            client.prevPoints = client.points;
            client.viewState = 'GAME';
        }
    }

    broadcastState();
}

/**
 * 全員回答提出後のAI判定処理
 */
async function processRoundAnswers() {
    gameState.phase = 'JUDGING';
    broadcastState();

    const activePlayers = Array.from(clients.values()).filter(c => c.inCurrentGame);
    const submissions = activePlayers.map(p => ({
        playerId: p.id,
        playerName: p.name,
        answerText: p.currentAnswer
    }));

    const rawAiResult = await judgeAnswers(gameState.currentTopic.text, submissions);
    const verifiedResult = enforceScoringRules(rawAiResult, activePlayers);

    const enrichedResults = verifiedResult.results.map(r => {
        const player = clients.get(r.playerId);
        let prevPts = 0;
        let newPts = 0;
        if (player) {
            prevPts = player.points;
            player.prevPoints = prevPts;
            player.points += r.earnedPoint;
            newPts = player.points;
            player.isReady = false;
            player.viewState = 'ROUND_RESULT';
        }
        return {
            ...r,
            playerName: player ? player.name : r.playerName,
            prevPoints: prevPts,
            totalPoints: newPts
        };
    });

    gameState.phase = 'ROUND_RESULT';
    gameState.lastRoundResults = {
        round: gameState.round,
        topic: gameState.currentTopic.text,
        summaryComment: verifiedResult.summaryComment,
        items: enrichedResults
    };

    broadcastState();
}

/**
 * 最終対戦結果画面への遷移処理（通常終了・エンドレス終了・強制終了共通）
 */
function transitionToFinalResult() {
    const activePlayers = Array.from(clients.values()).filter(c => c.inCurrentGame);
    const sorted = [...activePlayers].sort((a, b) => b.points - a.points);

    let currentRank = 1;
    const highestPoints = sorted.length > 0 ? sorted[0].points : 0;

    const standings = sorted.map((p, index) => {
        if (index > 0 && p.points < sorted[index - 1].points) {
            currentRank = index + 1;
        }

        // 勝利判定
        let isWinner = false;
        if (gameState.gameMode === 'STANDARD') {
            // スタンダードモード：3pts先取かつ1位
            isWinner = (p.points >= WINNING_POINTS && currentRank === 1);
            // 万が一強制終了等で3pts未到達の場合は最高得点者を勝者とする
            if (!isWinner && highestPoints < WINNING_POINTS && currentRank === 1 && highestPoints > 0) {
                isWinner = true;
            }
        } else {
            // エンドレスモード：最終的に最高得点を獲得した1位（同点優勝あり）
            isWinner = (currentRank === 1 && highestPoints > 0);
        }

        return {
            playerId: p.id,
            playerName: p.name,
            points: p.points,
            rank: currentRank,
            isWinner: isWinner
        };
    });

    gameState.finalStandings = standings;
    gameState.phase = 'LOBBY';

    for (const player of activePlayers) {
        player.inCurrentGame = false;
        player.isJoined = false;
        player.isReady = false;
        player.currentAnswer = '';
        player.viewState = 'FINAL_RESULT';
    }

    broadcastState();
}

io.on('connection', (socket) => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    clients.set(socket.id, {
        id: socket.id,
        name: `プレイヤー${randomSuffix}`,
        isJoined: false,
        inCurrentGame: false,
        points: 0,
        prevPoints: 0,
        isReady: false,
        currentAnswer: '',
        viewState: 'LOBBY'
    });

    broadcastState();

    /**
     * プレイヤー名変更
     */
    socket.on('updateName', (newName) => {
        const client = clients.get(socket.id);
        if (!client) return;
        const trimmed = String(newName || '').trim().slice(0, 16);
        if (!trimmed) return;

        client.name = trimmed;

        if (gameState.lastRoundResults && gameState.lastRoundResults.items) {
            gameState.lastRoundResults.items.forEach(item => {
                if (item.playerId === socket.id) {
                    item.playerName = trimmed;
                }
            });
        }
        if (gameState.finalStandings) {
            gameState.finalStandings.forEach(item => {
                if (item.playerId === socket.id) {
                    item.playerName = trimmed;
                }
            });
        }

        broadcastState();
    });

    /**
     * ゲームモード切り替え（ホストのみ可能・ロビー時のみ）
     */
    socket.on('setGameMode', (mode) => {
        updateHost();
        if (socket.id !== gameState.hostId) {
            socket.emit('errorMessage', 'ホストのみがゲームモードを変更できます。');
            return;
        }
        if (gameState.phase !== 'LOBBY') {
            socket.emit('errorMessage', 'ゲーム進行中はモードを変更できません。');
            return;
        }
        if (mode === 'STANDARD' || mode === 'ENDLESS') {
            gameState.gameMode = mode;
            broadcastState();
        }
    });

    /**
     * ホストによるゲーム強制終了（進行中のみ実行可能）
     */
    socket.on('forceEndGame', () => {
        updateHost();
        if (socket.id !== gameState.hostId) {
            socket.emit('errorMessage', 'ホストのみがゲームを終了できます。');
            return;
        }
        if (gameState.phase === 'LOBBY') {
            socket.emit('errorMessage', '現在進行中のゲームはありません。');
            return;
        }

        // 即座に最終リザルト画面へ遷移
        transitionToFinalResult();
    });

    /**
     * ロビーでのエントリー操作（参加する / 参加キャンセル）
     */
    socket.on('toggleJoin', () => {
        const client = clients.get(socket.id);
        if (!client) return;

        if (!client.isJoined) {
            const currentJoinedCount = Array.from(clients.values()).filter(c => c.isJoined).length;
            if (currentJoinedCount >= MAX_PLAYERS) {
                socket.emit('errorMessage', `参加人数が上限（${MAX_PLAYERS}名）に達しています。`);
                return;
            }
            client.isJoined = true;
            client.viewState = 'LOBBY';
        } else {
            client.isJoined = false;
        }

        broadcastState();
    });

    /**
     * ホストによるゲーム開始
     */
    socket.on('startGame', () => {
        const client = clients.get(socket.id);
        if (!client) return;

        updateHost();
        if (socket.id !== gameState.hostId) {
            socket.emit('errorMessage', 'ホスト（部屋主）のみがゲームを開始できます。');
            return;
        }

        if (gameState.phase !== 'LOBBY') {
            socket.emit('errorMessage', '現在ゲームが進行中です。');
            return;
        }

        const joinedPlayers = Array.from(clients.values()).filter(c => c.isJoined);
        if (joinedPlayers.length < MIN_PLAYERS || joinedPlayers.length > MAX_PLAYERS) {
            socket.emit('errorMessage', `ゲームを開始するには ${MIN_PLAYERS}〜${MAX_PLAYERS}名の参加者が必要です。`);
            return;
        }

        gameState.round = 0;
        gameState.finalStandings = null;
        topicManager.reset();

        for (const p of clients.values()) {
            if (p.isJoined) {
                p.inCurrentGame = true;
                p.points = 0;
                p.prevPoints = 0;
                p.isReady = false;
                p.currentAnswer = '';
                p.viewState = 'GAME';
            }
        }

        startNewRound();
    });

    /**
     * 回答提出
     */
    socket.on('submitAnswer', (answerText) => {
        const client = clients.get(socket.id);
        if (!client || !client.inCurrentGame) return;
        if (gameState.phase !== 'ANSWERING') return;

        const trimmed = String(answerText || '').trim().slice(0, 50);
        if (!trimmed) return;

        client.currentAnswer = trimmed;
        client.isReady = true;

        broadcastState();

        const activePlayers = Array.from(clients.values()).filter(c => c.inCurrentGame);
        const allAnswered = activePlayers.length > 0 && activePlayers.every(p => p.isReady);

        if (allAnswered) {
            processRoundAnswers();
        }
    });

    /**
     * ラウンドリザルト「次へ」
     */
    socket.on('nextRoundReady', () => {
        const client = clients.get(socket.id);
        if (!client || !client.inCurrentGame) return;
        if (gameState.phase !== 'ROUND_RESULT') return;

        client.isReady = true;
        broadcastState();

        const activePlayers = Array.from(clients.values()).filter(c => c.inCurrentGame);
        const allReady = activePlayers.length > 0 && activePlayers.every(p => p.isReady);

        if (allReady) {
            if (gameState.gameMode === 'STANDARD') {
                const hasWinner = activePlayers.some(p => p.points >= WINNING_POINTS);
                if (hasWinner) {
                    transitionToFinalResult();
                } else {
                    startNewRound();
                }
            } else {
                // エンドレスモード時はお題がある限り次ラウンドへ進行（無ければstartNewRound内で終了）
                startNewRound();
            }
        }
    });

    /**
     * 最終結果「再戦」
     */
    socket.on('rematch', () => {
        const client = clients.get(socket.id);
        if (!client) return;

        const currentJoinedCount = Array.from(clients.values()).filter(c => c.isJoined).length;
        if (currentJoinedCount < MAX_PLAYERS) {
            client.isJoined = true;
        } else {
            client.isJoined = false;
            socket.emit('errorMessage', `参加人数が上限（${MAX_PLAYERS}名）のため未エントリー状態でロビーへ戻りました。`);
        }

        client.inCurrentGame = false;
        client.points = 0;
        client.prevPoints = 0;
        client.isReady = false;
        client.currentAnswer = '';
        client.viewState = 'LOBBY';

        broadcastState();
    });

    /**
     * 最終結果「退出する」
     */
    socket.on('leaveToLobby', () => {
        const client = clients.get(socket.id);
        if (!client) return;

        client.isJoined = false;
        client.inCurrentGame = false;
        client.points = 0;
        client.prevPoints = 0;
        client.isReady = false;
        client.currentAnswer = '';
        client.viewState = 'LOBBY';

        if (gameState.hostId === client.id) {
            gameState.hostId = null;
        }

        broadcastState();
    });

    /**
     * 切断時の処理
     */
    socket.on('disconnect', () => {
        const client = clients.get(socket.id);
        const wasInGame = client ? client.inCurrentGame : false;
        const wasHost = (gameState.hostId === socket.id);

        clients.delete(socket.id);

        if (wasHost) {
            gameState.hostId = null;
        }

        if (wasInGame) {
            const remainingActive = Array.from(clients.values()).filter(c => c.inCurrentGame);
            if (remainingActive.length === 0) {
                gameState.phase = 'LOBBY';
                gameState.round = 0;
                gameState.currentTopic = null;
                gameState.lastRoundResults = null;
            } else if (gameState.phase === 'ANSWERING') {
                if (remainingActive.every(p => p.isReady)) {
                    processRoundAnswers();
                    return;
                }
            } else if (gameState.phase === 'ROUND_RESULT') {
                if (remainingActive.every(p => p.isReady)) {
                    if (gameState.gameMode === 'STANDARD') {
                        const hasWinner = remainingActive.some(p => p.points >= WINNING_POINTS);
                        if (hasWinner) {
                            transitionToFinalResult();
                        } else {
                            startNewRound();
                        }
                    } else {
                        startNewRound();
                    }
                    return;
                }
            }
        }

        broadcastState();
    });
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  The 2nd Server running on port ${PORT}`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`=========================================`);
});