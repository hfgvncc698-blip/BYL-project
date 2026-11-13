// Transform a disposable emulator rules copy only. Never writes production rules.
module.exports=function protectedSummaryRules(source){
 const marker='    match /clients/{clientId} {';
 const functions=`
    function summaryRootCreateSafe() {
      return !request.resource.data.keys().hasAny(['__summaryProtocol','__summaryEpoch']);
    }
    function summaryRootUpdateSafe() {
      let before = resource.data;
      let after = request.resource.data;
      let qualified = before.get('__summaryProtocol', 0) == 1;
      return after.get('__summaryProtocol', 0) == before.get('__summaryProtocol', 0) &&
        (qualified ? (
          after.get('__summaryEpoch', -1) is int &&
          ((after.__summaryEpoch == before.__summaryEpoch && after.get('dashboardProgramRevision', null) == before.get('dashboardProgramRevision', null)) ||
           (after.__summaryEpoch == before.__summaryEpoch + 1 && after.get('dashboardProgramRevision', null) == after.__summaryEpoch))
        ) : after.get('__summaryEpoch', null) == before.get('__summaryEpoch', null));
    }
    function summaryWriteAtomic(clientId) {
      let before = get(/databases/$(database)/documents/clients/$(clientId)).data;
      return before.get('__summaryProtocol', 0) != 1 || (
        getAfter(/databases/$(database)/documents/clients/$(clientId)).data.get('__summaryEpoch', -1) == before.__summaryEpoch + 1 &&
        getAfter(/databases/$(database)/documents/clients/$(clientId)).data.get('dashboardProgramRevision', null) == before.__summaryEpoch + 1
      );
    }
`;
 if(!source.includes(marker))throw Error('Missing clients rule');
 source=source.replace(marker,functions+marker);
 const start=source.indexOf(marker),end=source.indexOf('      match /measurements/',start);
 let block=source.slice(start,end);
 block=block.replace('allow create: if canCreateClient(clientId, request.resource.data);','allow create: if summaryRootCreateSafe() && canCreateClient(clientId, request.resource.data);');
 block=block.replace('allow update: if isAdmin() || (','allow update: if summaryRootUpdateSafe() && (isAdmin() || (');
 block=block.replace('clientSecurityFieldsUnchanged()\n      );','clientSecurityFieldsUnchanged()\n      ));');
 const original=`      match /programmes/{document=**} {
        allow read, write: if canAccessClient(
          clientId,
          get(/databases/$(database)/documents/clients/$(clientId)).data
        );
      }`;
 const changed=`      match /programmes/{document=**} {
        allow read: if canAccessClient(clientId, get(/databases/$(database)/documents/clients/$(clientId)).data);
        allow write: if canAccessClient(clientId, get(/databases/$(database)/documents/clients/$(clientId)).data) && summaryWriteAtomic(clientId);
      }`;
 if(!block.includes(original))throw Error('Program rule changed');block=block.replace(original,changed);
 source=source.slice(0,start)+block+source.slice(end);
 // Firestore allow statements are ORed: the existing admin wildcard must also
 // require the epoch, otherwise it bypasses the more specific program rule.
 const wildcard=`      match /{subCollection}/{document=**} {
        allow read, write: if isAdmin();
      }`;
 const replacement=`      match /{subCollection}/{document=**} {
        allow read: if isAdmin();
        allow write: if isAdmin() && (subCollection != 'programmes' || summaryWriteAtomic(clientId));
      }`;
 const position=source.indexOf(wildcard,source.indexOf(marker));
 if(position<0 || position>source.indexOf('    match /programmes/{programId}'))throw Error('Client admin wildcard changed');
 return source.slice(0,position)+source.slice(position).replace(wildcard,replacement);
};
