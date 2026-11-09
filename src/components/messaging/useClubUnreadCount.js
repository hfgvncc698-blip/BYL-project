import { useMessagingFeed } from './messagingFeed';
export default function useClubUnreadCount(clubId) {
  return useMessagingFeed({scope:clubId, enabled:!!clubId}).unreadCount || 0;
}
