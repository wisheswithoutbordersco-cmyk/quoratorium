export interface ConversationSummary {
  id: number | string;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

function timestamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getMostRecentConversation<T extends ConversationSummary>(conversations: T[]): T | undefined {
  return conversations.reduce<T | undefined>((latest, conversation) => {
    if (!latest) return conversation;
    const conversationTime = timestamp(conversation.updatedAt ?? conversation.createdAt);
    const latestTime = timestamp(latest.updatedAt ?? latest.createdAt);
    return conversationTime > latestTime ? conversation : latest;
  }, undefined);
}
