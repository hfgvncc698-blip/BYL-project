export function cancellationPreview(conversation,translate){
 const meta=conversation?.lastMessageMeta;
 // Ignore metadata left behind when a newer ordinary message is sent.
 if(!meta||meta.at!==conversation.lastMessageAtIso)return conversation?.lastMessage||'';
 if(meta.kind==='cancellation')return `${translate('Annulations')} · ${meta.title||''}`;
 if(meta.kind==='cancellation-decision')return translate(meta.decision==='accepted'?'Justification acceptée':'Justification refusée');
 return conversation?.lastMessage||'';
}
