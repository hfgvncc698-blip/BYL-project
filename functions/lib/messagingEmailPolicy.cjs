const DAY=24*60*60*1000;
const millis=v=>v?.toMillis?.()??(v instanceof Date?v.getTime():typeof v==='string'?Date.parse(v):Number(v)||0);
function emailSkipReason({messageAt,previousMessageAt,readAt,lastSentAt,now=Date.now()}){
 const message=millis(messageAt),previous=millis(previousMessageAt),read=millis(readAt),sent=millis(lastSentAt);
 if(!message)return 'missing-message-date';
 if(read>=message)return 'already-read';
 if(sent&&sent>read)return 'unread-sequence-already-notified';
 if(previous&&message-previous<=DAY)return 'conversation-recently-active';
 if(read&&now-read<=DAY)return 'recipient-recently-active';
 return null;
}
module.exports={emailSkipReason};
