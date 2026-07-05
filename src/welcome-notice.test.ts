import { describe, expect, it } from "vitest";
import {
  markWelcomeNoticeSeen,
  shouldShowWelcomeNotice,
} from "./welcome-notice";

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

describe("welcome notice", () => {
  it("shows until it has been marked as seen", () => {
    const storage = makeStorage();

    expect(shouldShowWelcomeNotice(storage)).toBe(true);
    markWelcomeNoticeSeen(storage);

    expect(shouldShowWelcomeNotice(storage)).toBe(false);
  });
});
