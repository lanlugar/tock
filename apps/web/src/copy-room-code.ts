/** Clipboard permissions vary across HTTPS, LAN HTTP and embedded browsers. */
export async function copyRoomCode(code: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      return true;
    }
  } catch {
    // Some browsers expose the API but reject writes; try their selection-based copy.
  }
  const active = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : [];
  const field = document.createElement('textarea');
  field.value = code;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(field);
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, code.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
  }
}
