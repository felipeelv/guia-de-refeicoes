import type { ProfileStorage } from "./profile-store.ts";

export interface DraftStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function browserProfileStorage(): ProfileStorage {
  return {
    get(key) {
      return localStorage.getItem(key);
    },
    set(key, value) {
      localStorage.setItem(key, value);
    },
    keys() {
      const all: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key) all.push(key);
      }
      return all;
    },
  };
}

export function browserDraftStorage(): DraftStorage {
  return {
    get(key) {
      return localStorage.getItem(key);
    },
    set(key, value) {
      localStorage.setItem(key, value);
    },
    remove(key) {
      localStorage.removeItem(key);
    },
  };
}
