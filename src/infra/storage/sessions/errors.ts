/** Reports an unreadable index or an inconsistent indexed provider file. */
export class AISessionStoreCorruptError extends Error {
  constructor() {
    super('sessions/index.json or an indexed provider session is invalid or unreadable');
    this.name = 'AISessionStoreCorruptError';
  }
}

/** Reports a session transition that cannot be safely persisted. */
export class AISessionPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AISessionPersistError';
  }
}
