# メトリクス & 評価基準

## 1. 目的

- ユーザ体験: 過負荷 (burnout) なく記憶保持を最大化
- モデル適合: 期待保持率に収束
- 運用: レイテンシ・失敗率低保持

## 2. 指標一覧

| カテゴリ | 指標                  | 定義/算出                                   | 目的               | 収集頻度   |
| -------- | --------------------- | ------------------------------------------- | ------------------ | ---------- |
| 学習成果 | Retention (実測)      | 当日レビューで正答した旧カード / 全旧カード | モデル適合確認     | 日次       |
| 学習成果 | Expected Retention    | Σ retrievability / 件数                     | 期待 vs 実測比較   | 日次       |
| 学習成果 | Retention Gap         | Expected - Actual                           | モデル過/過少最適  | 日次       |
| 効率     | Avg Time / Card       | (show→評価) 時間平均                        | UI/モデル速度      | 週次       |
| 効率     | Reviews / Minute      | セッション内                                | 集中度             | セッション |
| 負荷     | Future Due Peak Ratio | 30日内 max(dueCount)/avg                    | スパイク検知       | 日次       |
| 負荷     | Overdue Ratio         | overdueCards / totalActiveCards             | Backlog 蓄積       | 日次       |
| 品質     | Lapse Rate            | lapses / review reps                        | 材料/分割必要性    | 週次       |
| 品質     | Leech Count           | leech フラグカード数                        | 問題品質           | 週次       |
| モデル   | Param Update Gain     | 再推定前後の対数尤度差                      | モデル改善検証     | 推定時     |
| モデル   | Stability Drift       | 中位数安定度の前週差                        | 漂流監視           | 週次       |
| 信頼性   | Persist Failure Rate  | 失敗 patch / 全 patch                       | ネットワーク健全性 | 日次       |
| 信頼性   | Retry Latency P95     | 再試行含む遅延                              | UX                 | 週次       |

## 3. アラート閾値例

| 指標                  | 閾値   | アクション                        |
| --------------------- | ------ | --------------------------------- |
| Retention Gap         | > 0.1  | パラメータ再推定 / RT 調整        |
| Overdue Ratio         | > 0.25 | 新規導入一時減少                  |
| Future Due Peak Ratio | > 2.5  | fuzz 増加 / 導入抑制              |
| Lapse Rate            | > 0.3  | Leech 判定閾値引下げ              |
| Persist Failure Rate  | > 0.05 | リトライ/オフライン fallback 強化 |

## 4. 計測実装ノート

- 軽量イベントバス (publish/subscribe)
  を導入し、学習フローからメトリクス集計を分離。
- セッション終了時に集計 flush。即時性不要指標は遅延計算。
- プライバシ: 個人識別情報を含めず匿名集計。外部送信は opt-in。

## 5. 可視化 (将来 UI)

| ビュー         | 内容                                                               |
| -------------- | ------------------------------------------------------------------ |
| Dashboard      | 今日のレビュー, 新規導入, Retention, Overdue, 未来30日ヒートマップ |
| Card Inspector | 個別カードの stability/difficulty 推移, lapse 履歴                 |
| Model Panel    | パラメータ推定の履歴と改善曲線                                     |

## 6. AB / 実験フレーム (長期)

- 例: fuzzPercent 5% vs 10% が Retention Gap に与える影響
- ランダム割当 (カード or セッション単位) + 結果統計検定 (Mann-Whitney, Bayesian
  A/B)

## 7. データ品質チェック

| チェック        | 条件                   | 処理         |
| --------------- | ---------------------- | ------------ |
| 逆行 due        | card.due < last_review | 再計算標準化 |
| stability 異常  | stability <= 0         | 最低値 clamp |
| difficulty 範囲 | outside [1,10] (例)    | クリップ     |
| timestamp 急進  | > 現在+2年             | 無効化ログ   |

## 8. 最小実装スコープ (Phase A)

- Retention, Overdue Ratio, Reviews Count のみ (Map 走査で算出十分)

## 9. データ保持ポリシー

| 種別          | 保持期間 | その後        |
| ------------- | -------- | ------------- |
| Raw ReviewLog | 1年      | 集計/圧縮移行 |
| 集計サマリ    | 無期限   | -             |

---

スケジューリング詳細:
[scheduling_strategy.md](./scheduling_strategy.md)。学習理論背景:
[learning_theory.md](./learning_theory.md)。
