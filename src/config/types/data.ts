/**
 * 数据管理配置类型
 */

/** 数据管理配置 */
export interface DataConfig {
  /**
   * AI 成功后是否永久保留原始数据（raw.json / analyzed.json）
   * - true：永久保留，不自动清理
   * - false：按 rawRetention 天数自动清理（默认）
   */
  keepRaw?: boolean;

  /**
   * 原始数据保留天数（仅 keepRaw=false 时生效）
   * 超过此天数的 raw.json / analyzed.json 会被自动清理
   * result.json 永远不会被清理
   * 有效范围：>= 0（0 表示不保留，负数会被修正为 0）
   */
  rawRetention?: number;
}
