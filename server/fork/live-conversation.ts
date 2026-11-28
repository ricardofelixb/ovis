/** Live previews go only to attached viewers who asked for this conversation. */
export function wantsLiveConversation(paneId: string, attached: ReadonlyMap<string, unknown>, interests: ReadonlySet<string>): boolean {
  return attached.has(paneId) && interests.has(paneId);
}
