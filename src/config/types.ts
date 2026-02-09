/**
 * 配置类型定义文件
 */

export interface V2erConfig {
  /** 代理服务器地址（如 http://127.0.0.1:10808） */
  proxy?: string;

  /** AI 分析配置 */
  ai?: {
    /** Gemini API 密钥 */
    geminiApiKey?: string;
    /** 模型名称（默认 gemini-2.0-flash） */
    model?: string;
  };
}
