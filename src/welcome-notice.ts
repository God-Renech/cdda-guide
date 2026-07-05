const STORAGE_KEY = "cdda-guide:welcome-notice-seen";

export function shouldShowWelcomeNotice(storage: Storage = localStorage) {
  try {
    return storage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markWelcomeNoticeSeen(storage: Storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures; the notice can be dismissed for this session.
  }
}
