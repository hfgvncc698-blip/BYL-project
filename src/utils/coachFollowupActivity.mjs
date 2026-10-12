const millis = value => {
 if(value?.toMillis)return value.toMillis();
 if(value?.seconds)return Number(value.seconds)*1000;
 if(typeof value==='number')return value;
 if(value instanceof Date)return value.getTime();
 return typeof value==='string' ? Date.parse(value)||0 : 0;
};
// A takeover or program assignment starts a new follow-up period, without inventing a completed session.
export function coachFollowupActivity(client, coachUid) {
 return Math.max(
  millis(client._lastCoachInteractionMs), millis(client.lastCoachInteractionAt),
  millis(client._latestAssignMs), millis(client.followupStartedAtByCoach?.[coachUid]),
  millis(client.createdAt), millis(client.creeLe)
 );
}
export function needsCoachFollowup(client,coachUid,now=Date.now()) {
 const reference=coachFollowupActivity(client,coachUid);
 return reference>0 && now-reference>30*86400000;
}
