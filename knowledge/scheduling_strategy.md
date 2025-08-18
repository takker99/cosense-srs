# スケジューリング戦略設計

本ドキュメントは学習セッション内および日跨ぎのカード選択アルゴリズム指針。

## 1. キュー構造

| キュー         | 内容                                   | 優先順位 | 再投入条件           |
| -------------- | -------------------------------------- | -------- | -------------------- |
| learningQueue  | 学習ステップ中 (短期間隔) カード       | 最高     | 次学習ステップ残あり |
| reviewDueQueue | 期限到来 (due <= now) のレビューカード | 次       | 評価後 interval 更新 |
| newQueue       | まだ学習していないカード               | 低       | dailyNewLimit 未達   |
| laterQueue     | bury / backlog 調整により遅延          | 可変     | 予定タイミング到達   |
| suspendedQueue | leech / ユーザ停止                     | 最低     | 手動解除             |

## 2. セッション内選択アルゴリズム (擬似コード)

```
while (sessionActive) {
  refillLearningQueueIfDue(); // 短期ステップの due 到来カード
  candidate = pickNext();
  if (!candidate) break;
  present(candidate);
  rating = await userAnswer();
  result = fsrs.next(candidate.card, now, rating);
  updateMemory(result.card);
  persistBuffer.push(result.card, result.log);
  routeAfterAnswer(result.card, rating);
  flushIfNeeded();
}
```

### pickNext()

1. learningQueue 非空なら最小 due (または FIFO) を取得
2. それ以外で reviewDueQueue から _最も遅延が大きい_ あるいは _最小 stability_
   を tie-break
3. newQueue: 需要があり dailyNewLimit 未到達 & 現在のレビュー密度を見て投入

## 3. 優先順位補正式

`priority = base + α * lateness + β * (1 - retrievability)`

- `base` : キュー種別定数 (learning > review > new)
- `lateness = max(0, now - due)` (時間単位)
- `retrievability` : FSRS から算出 (忘却確率補助)

実装簡易版: learning > review (arrival order) > new (FIFO)
から開始し段階的に高度化。

## 4. Learning Steps

- 設定例: [1, 10] 分
- FSRS `state` が Learning の場合、`due = now + stepMinutes[i]` で再挿入。
- 全ステップ完了で次間隔 (日単位) に昇格。

## 5. Bury ロジック

- Cloze siblings: 同一 note の未出題 siblings を `laterQueue` に移し
  `buryUntil = todayEnd`。
- 学習ステップ中に siblings が発生した場合は bury せず、初回出題時のみ適用。

## 6. Backlog 平準化

1. 日別 due 集計 (未来30日) を算出。
2. ピーク日が平均比 `> 2.0` → 新規導入数を線形で縮小。
3. 過剰 backlog は `laterQueue` にずらし + fuzz。

## 7. Interval Fuzz (Deterministic)

```
seed = hash(cardId + scheduledDays + createdDay)
rand = pseudoRandom(seed)
fuzzFactor = 1 + (rand * 2 - 1) * fuzzPercent/100
intervalDays = round(baseIntervalDays * fuzzFactor)
```

## 8. Persist 戦略

| 戦略                   | Pros                            | Cons                           |
| ---------------------- | ------------------------------- | ------------------------------ |
| 即時書込               | データ消失リスク低              | ネットワーク頻度高 / 遅延      |
| バッチ (N 回 or Δt 秒) | 往復削減                        | セッション途中クラッシュリスク |
| ハイブリッド           | 重要フィールド即時 + 残りバッチ | 実装複雑                       |

初期: バッチ (回答10件 or 30秒) + セッション終了時フラッシュ。

## 9. 冪等性 / 衝突

- patch 前にカード行ハッシュ (`sha256(stringify(card))`)
  をコメント等に埋め込み比較、差分検知。
- 競合時: ローカル再適用 (last-write-wins 回避)。

## 10. Offline モード

| 状態           | 動作                                    |
| -------------- | --------------------------------------- |
| オフライン検知 | patch を local queue (IndexedDB) に保存 |
| 再接続         | 時系列順に再送。競合は timestamp 比較。 |

## 11. 終了条件

- すべての learningQueue 空 + reviewDueQueue 空 + newQueue 使用回数 >=
  dailyNewLimit
- またはユーザ手動終了

## 12. 計測フック

| Hook                          | 目的               |
| ----------------------------- | ------------------ |
| onPick(cardId)                | 出題遅延計測開始   |
| onShowAnswer(cardId)          | 思考時間 t_answer  |
| onPersist(batchSize, latency) | ネットワーク健全性 |

## 13. 実装フェーズ分割

1. Phase A: メモリ更新 + 簡易 learning/review/new 三分割 FIFO
2. Phase B: Learning steps + bury siblings + deterministic fuzz
3. Phase C: Backlog 平準化 + 優先順位スコアリング
4. Phase D: バッチ書込 + 冪等/競合解決
5. Phase E: Offline / load 予測 UI

---

アルゴリズムの評価基準は
[metrics_and_evaluation.md](./metrics_and_evaluation.md) を参照。
