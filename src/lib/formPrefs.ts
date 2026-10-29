export type FormPrefs = { categoryId?: string; freezerId?: string; compartmentId?: string };

const KEY = 'fm.formPrefs';

export function loadFormPrefs(): FormPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFormPrefs(prefs: FormPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
