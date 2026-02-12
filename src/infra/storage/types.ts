/**
 * Storage 模块类型定义
 *
 * 定义数据文件类型和读写选项。
 */

/** 数据文件类型 */
export type DataFileType = 'raw' | 'analyzed' | 'result';

/**
 * 数据文件类型到文件名的映射
 * 供 paths 模块使用
 */
export const DATA_FILE_NAMES: Record<DataFileType, string> = {
  raw: 'raw.json',
  analyzed: 'analyzed.json',
  result: 'result.json',
};

/** 写入选项 */
export interface WriteOptions {
  /**
   * 是否格式化 JSON 输出（美化缩进）
   * 默认 true
   */
  pretty?: boolean;
}
