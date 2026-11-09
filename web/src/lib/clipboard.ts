/**
 * Copies text to the clipboard. Resolves to false instead of throwing when
 * the browser refuses (no permission, insecure page, old browser), so the
 * caller can show the text for the person to copy by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
