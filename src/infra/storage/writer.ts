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
import { getDataFilePath, getUserDataDir } from './paths';

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

function writeFileAtomically(dataDir: string, filePath: string, content: string): void {
  const tempPath = path.join(
    dataDir,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.writeFileSync(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // A creation failure can leave the temporary path absent.
    }
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

function restoreDataFile(
  dataDir: string,
  filePath: string,
  restorePoint: DataFileRestorePoint,
): void {
  if (restorePoint.status === 'present') {
    writeFileAtomically(dataDir, filePath, restorePoint.content);
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
  const { pretty = true } = options;

  const dataDir = getUserDataDir(username);
  const filePath = getDataFilePath(username, type);
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  writeFileAtomically(dataDir, filePath, content);
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
  const dataDir = getUserDataDir(username);
  const filePath = getDataFilePath(username, type);
  const restorePoint = captureRestorePoint(filePath);

  writeDataFile(username, type, data, options);

  try {
    afterWrite();
  } catch (operationError) {
    try {
      restoreDataFile(dataDir, filePath, restorePoint);
    } catch (rollbackError) {
      throw new DataFilePostWriteError(operationError, rollbackError);
    }
    throw new DataFilePostWriteError(operationError);
  }
}
