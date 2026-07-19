/**
 * 数据管理配置类型
 */

/** Source-data retention configuration. */
export interface DataConfig {
  /**
   * Source-data retention mode after successful AI analysis.
   * - true: permanent raw.json and analyzed.json retention (default)
   * - false: age-based cleanup using rawRetention
   */
  keepRaw?: boolean;

  /**
   * raw.json and analyzed.json retention period for keepRaw=false.
   * result.json has permanent retention.
   * Valid range: >= 0; zero makes source files immediately eligible for cleanup.
   */
  rawRetention?: number;
}
