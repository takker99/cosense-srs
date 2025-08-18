import type { CosenseCard } from "./card.ts";
import type { CardId } from "./card.ts";

/**
 * In-memory batching layer for card & review log persistence.
 *
 * 背景:
 *  1 回答毎にストレージへ即書き込みすると I/O 呼び出し過多 / レイテンシ悪化 / ネットワーク負荷増。
 *  PersistenceBuffer は一定件数または一定時間でまとめて flush し、往復回数を削減する。
 */

/**
 * A batch of card state updates keyed by CardId.
 *  現状は `Map<CardId, CosenseCard>` 自体を直接 flush に渡すためラッパー未使用だが
 *  将来 diff / 圧縮付加メタデータを添付する余地を残す目的で定義。 (未使用のため参考用)
 */
export interface CardWriteBatch { cards: Map<CardId, CosenseCard>; }

/**
 * Normalized review log entry (FSRS next() 由来フィールド + 拡張予定). Dates は起点で Date 化済。
 * responseTimeMs: (B6) で計測する予定の回答時間 (ms)。存在しない場合は未計測として扱う。
 */
export interface ReviewLogRecord {
  noteId: string; // 親ノートID
  ord: number; // cloze ordinal
  rating: number; // 0..3 (Again/Hard/Good/Easy)
  state: number; // FSRS state enum numeric
  due: Date; // 次回予定日時
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: Date; // レビュー実行時刻
  responseTimeMs?: number; // (B6) optional latency
}

/** Dependency injection surface for side-effects (storage / network). */
export interface FlushFns {
  /** Persist a set of updated cards (id -> full snapshot). */
  writeCards(batch: Map<CardId, CosenseCard>): Promise<unknown>;
  /** Append / persist review log rows. */
  writeLogs(logs: ReviewLogRecord[]): Promise<unknown>;
}

/**
 * Batching policy.
 * maxCards / maxLogs: 件数が閾値以上になったら即 flush.
 * maxAgeMs: 最後の flush からの経過時間が閾値を超えたら (maybeFlush 呼び出し時に) flush.
 */
export interface BufferConfig {
  maxCards: number;
  maxLogs: number;
  maxAgeMs: number;
}

/** デフォルト閾値: 少量学習セッションで過剰 flush を避けつつ応答性確保するバランス設定。 */
export const defaultBufferConfig: BufferConfig = { maxCards: 10, maxLogs: 10, maxAgeMs: 30_000 };

/**
 * Collects incremental card + log updates until policy triggers a flush.
 * 使用側は addCard/addLog 後に maybeFlush() を適切な頻度 (各回答後) で呼び出す。
 * セッション終了時 flushAndDispose() で未書き込みを確実に反映。
 *
 * スレッド安全性: 単一スレッド前提 (ブラウザ / Deno 単一イベントループ)。
 * エラー処理: flush() 中に writeCards/writeLogs が throw した場合、対象バッチは失われるため
 * 重大な永続化要件があるならリトライ戦略を上層で実装すること。
 */
export class PersistenceBuffer {
  #cards = new Map<CardId, CosenseCard>();
  #logs: ReviewLogRecord[] = [];
  #lastFlush = Date.now();
  constructor(private fns: FlushFns, private cfg: BufferConfig = defaultBufferConfig) {}

  /** 最新状態でカードをバッチへ登録 (同一IDは上書き -> diff最適化は未実装). */
  addCard(id: CardId, card: CosenseCard) {
    this.#cards.set(id, card);
  }
  /** レビュー結果ログを追加 (順序維持). */
  addLog(rec: ReviewLogRecord) {
    this.#logs.push(rec);
  }

  /** 現在の閾値条件で即時 flush が必要か判定 (副作用なし). */
  needsFlush(now = Date.now()): boolean {
    return this.#cards.size >= this.cfg.maxCards ||
      this.#logs.length >= this.cfg.maxLogs ||
      (now - this.#lastFlush) >= this.cfg.maxAgeMs;
  }

  /** 閾値を満たしたバッチを同期的に排出。成功後内部バッファをクリア。 */
  async flush(now = Date.now()): Promise<void> {
    if (this.#cards.size === 0 && this.#logs.length === 0) return;
    const cards = this.#cards;
    const logs = this.#logs;
    this.#cards = new Map();
    this.#logs = [];
    await this.fns.writeCards(cards);
    await this.fns.writeLogs(logs);
    this.#lastFlush = now;
  }

  /** needsFlush() が true の場合のみ flush。 */
  async maybeFlush(now = Date.now()) {
    if (this.needsFlush(now)) await this.flush(now);
  }

  /** 未処理バッチを強制排出し内部リソースを開放。 */
  async flushAndDispose() {
    await this.flush();
  }
}
