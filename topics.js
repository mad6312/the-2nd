/**
 * The 2nd - お題データ管理専用モジュール
 */

const TOPIC_LIST = [
    { id: 1, text: "スーパーファミコンの代表的なゲームといえば？" },
    { id: 2, text: "週刊少年ジャンプの代表的な漫画といえば？" },
    { id: 3, text: "マクドナルドの定番ハンバーガーメニューといえば？" },
    { id: 4, text: "スタジオジブリのアニメ映画といえば？" },
    { id: 5, text: "NINTENDO 64の代表的なゲームといえば？" },
    { id: 6, text: "運動会で耳にする定番の楽曲といえば？" },
    { id: 7, text: "Wiiの代表的なゲームといえば？" },
    { id: 8, text: "誰もが知っている国民的RPGゲームシリーズといえば？" },
    { id: 9, text: "プレイステーション1の代表的なゲームといえば？" },
    { id: 10, text: "ドラえもんの有名なひみつ道具といえば？" },
    { id: 11, text: "プレイステーション2の代表的なゲームといえば？" },
    { id: 12, text: "ゲームボーイアドバンスの代表的なゲームといえば？" },
    { id: 13, text: "ニンテンドーDSの代表的なゲームといえば？" },
    { id: 14, text: "ファイナルファンタジーの代表的なキャラクターといえば？" },
    { id: 15, text: "スマブラに参戦している人気キャラクターといえば？" },
    { id: 16, text: "小学校の給食で大人気だった定番メニューといえば？" },
    { id: 17, text: "誰もが知っている定番のボードゲーム・アナログゲームといえば？" },
    { id: 18, text: "カフェや喫茶店で注文する定番のメニューといえば？" },
    { id: 19, text: "スーパーマリオシリーズに登場するキャラクターといえば？" },
    { id: 20, text: "2010年代の代表的なアニメ作品といえば？" },
    { id: 21, text: "カラオケの定番曲といえば？" },
    { id: 22, text: "全国展開している有名外食チェーンといえば？" },
    { id: 23, text: "日本の朝食に出てくる定番のメニューといえば？" },
    { id: 24, text: "誰もが知っているスポーツ選手といえば？" },
    { id: 25, text: "日本を代表する伝統的な和菓子・スイーツといえば？" },
    { id: 26, text: "日本の有名なプロ野球球団といえば？" },
    { id: 27, text: "洋食屋さんの王道定番メニューといえば？" },
    { id: 28, text: "中くらいのサイズのボールを使ったスポーツといえば？" },
    { id: 29, text: "子供に人気のキャラクターといえば？" },
    { id: 30, text: "トランプを使った定番のカードゲームといえば？" },
    { id: 31, text: "2000年代の代表的なアニメ作品といえば？" },
    { id: 32, text: "辛い料理の定番といえば？" },
    { id: 33, text: "ドラマの主題歌といえば？" },
    { id: 34, text: "最初のパートナーポケモンといえば？" },
    { id: 35, text: "高級料理といえば？" },
    { id: 36, text: "炎を扱うキャラクターといえば？" },
    { id: 37, text: "拳で闘うキャラクターといえば？" },
    { id: 38, text: "ラーメンの定番といえば？" },
    { id: 39, text: "夜中に小腹がすいた時に食べる定番といえば？" },
    { id: 40, text: "医療がテーマになっている作品といえば？" },
    { id: 41, text: "シューティングゲームといえば？" },
    { id: 42, text: "3人組が出てくる作品といえば？" },
    { id: 43, text: "料理漫画といえば？" },
    { id: 44, text: "ロボットアニメといえば？" },
    { id: 45, text: "部活動といえば？" },
    { id: 46, text: "RPG作品の代表的な呪文や魔法といえば？" },
    { id: 47, text: "バトル漫画の代表的な必殺技といえば？" },
    { id: 48, text: "健康的な食べ物といえば？" },
    { id: 49, text: "無人島に一つだけ持っていけるとしたら何を持っていく？" },
    { id: 50, text: "青いイメージのキャラクターといえば？" },
    { id: 51, text: "悪役キャラクターといえば？" },
    { id: 52, text: "最強キャラといえば？" },
    { id: 53, text: "喉が渇いた時に飲みたい飲み物といえば？" }
];

class TopicManager {
    constructor() {
        this.usedTopicIds = new Set();
    }

    /**
     * 未出題のお題が存在するか判定
     */
    hasMoreTopics() {
        return this.usedTopicIds.size < TOPIC_LIST.length;
    }

    /**
     * 残りのお題数を取得
     */
    getRemainingCount() {
        return TOPIC_LIST.length - this.usedTopicIds.size;
    }

    /**
     * 総お題数を取得
     */
    getTotalCount() {
        return TOPIC_LIST.length;
    }

    /**
     * 次のお題を取得する
     * @param {string} mode 'STANDARD' | 'ENDLESS'
     * @returns {Object|null} お題オブジェクト、エンドレスで終了時は null
     */
    getNextTopic(mode = 'STANDARD') {
        let availableTopics = TOPIC_LIST.filter(t => !this.usedTopicIds.has(t.id));

        if (availableTopics.length === 0) {
            if (mode === 'ENDLESS') {
                // エンドレスモードはお題が尽きたら終了
                return null;
            }
            // スタンダードモードはリセットして再循環
            this.usedTopicIds.clear();
            availableTopics = [...TOPIC_LIST];
        }

        const randomIndex = Math.floor(Math.random() * availableTopics.length);
        const selectedTopic = availableTopics[randomIndex];
        this.usedTopicIds.add(selectedTopic.id);

        return selectedTopic;
    }

    /**
     * ゲーム開始時に出題履歴をリセット
     */
    reset() {
        this.usedTopicIds.clear();
    }
}

module.exports = new TopicManager();