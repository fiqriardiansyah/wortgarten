import { repairJson } from './repair-json';

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(repairJson(text));
    } catch {
      return null;
    }
  }
}
