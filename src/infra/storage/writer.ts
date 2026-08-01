/**
 * Storage 文件写入
 *
 * 通过同目录临时文件和原子 rename 写入用户 JSON 数据。
 * 自动创建目录，默认格式化输出。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import type { DataFileType, WriteOptions } from './types';
import { getDataFilePath } from './paths';

type DataFileRestorePoint = { status: 'missing' } | { status: 'present'; content: string };

/** Error raised after a data write when the dependent operation cannot commit. */
export class DataFilePostWriteError extends Error {
  readonly rollbackError?: unknown;

  constructor(operationError: unknown, rollbackError?: unknown) {
    const operationMessage =
      operationError instanceof Error ? operationError.message : String(operationError);
    const rollbackMessage =
      rollbackError === undefined
        ? ''
        : `; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
    super(`Post-write operation failed: ${operationMessage}${rollbackMessage}`);
    this.name = 'DataFilePostWriteError';
    this.rollbackError = rollbackError;
  }
}

function createTemporaryPath(filePath: string): string {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
}

function removeTemporaryFile(tempPath: string): void {
  try {
    fs.unlinkSync(tempPath);
  } catch {
    // The authoritative write error remains unchanged when no temporary file exists.
  }
}

function writeFileAtomically(filePath: string, content: string): void {
  const dataDir = path.dirname(filePath);
  const tempPath = createTemporaryPath(filePath);

  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.writeFileSync(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    removeTemporaryFile(tempPath);
    throw error;
  }
}

function stringifyJson(data: unknown, options: WriteOptions): string {
  const { pretty = true } = options;
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  if (content === undefined) {
    throw new TypeError('JSON file value is not serializable');
  }
  return content;
}

/**
 * Atomically replaces one application-owned JSON file.
 *
 * @param filePath - Validated target path.
 * @param data - JSON-serializable value.
 * @param options - JSON formatting options.
 * @throws A serialization or filesystem error.
 */
export function writeJsonFileAtomically(
  filePath: string,
  data: unknown,
  options: WriteOptions = {},
): void {
  writeFileAtomically(filePath, stringifyJson(data, options));
}

/**
 * Publishes one immutable JSON file without replacing an existing target.
 *
 * @param filePath - Validated target path.
 * @param data - JSON-serializable value.
 * @param options - JSON formatting options.
 * @throws A serialization or filesystem error, including an existing target.
 */
export function writeJsonFileExclusively(
  filePath: string,
  data: unknown,
  options: WriteOptions = {},
): void {
  const dataDir = path.dirname(filePath);
  const tempPath = createTemporaryPath(filePath);
  const content = stringifyJson(data, options);

  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.writeFileSync(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.linkSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  } catch (error) {
    removeTemporaryFile(tempPath);
    throw error;
  }
}

function captureRestorePoint(filePath: string): DataFileRestorePoint {
  try {
    return { status: 'present', content: fs.readFileSync(filePath, 'utf-8') };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { status: 'missing' };
    }
    throw error;
  }
}

function restoreDataFile(filePath: string, restorePoint: DataFileRestorePoint): void {
  if (restorePoint.status === 'present') {
    writeFileAtomically(filePath, restorePoint.content);
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Atomically writes one JSON data file.
 *
 * @param username - V2EX username that owns the data file.
 * @param type - Supported data file type.
 * @param data - JSON-serializable value.
 * @param options - JSON formatting options.
 * @throws A serialization or filesystem error.
 */
export function writeDataFile(
  username: string,
  type: DataFileType,
  data: unknown,
  options: WriteOptions = {},
): void {
  const filePath = getDataFilePath(username, type);
  writeJsonFileAtomically(filePath, data, options);
}

/**
 * Writes a data file and restores its previous bytes when a dependent write fails.
 *
 * @param username - V2EX username that owns the data file.
 * @param type - Supported data file type.
 * @param data - JSON-serializable replacement value.
 * @param afterWrite - Dependent persistence operation committed after the data file.
 * @param options - JSON formatting options.
 * @throws The initial write error or DataFilePostWriteError after compensation.
 */
export function writeDataFileWithRollback(
  username: string,
  type: DataFileType,
  data: unknown,
  afterWrite: () => void,
  options: WriteOptions = {},
): void {
  const filePath = getDataFilePath(username, type);
  const restorePoint = captureRestorePoint(filePath);

  writeDataFile(username, type, data, options);

  try {
    afterWrite();
  } catch (operationError) {
    try {
      restoreDataFile(filePath, restorePoint);
    } catch (rollbackError) {
      throw new DataFilePostWriteError(operationError, rollbackError);
    }
    throw new DataFilePostWriteError(operationError);
  }
}
