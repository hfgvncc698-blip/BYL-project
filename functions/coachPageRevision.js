// A duplicate/out-of-order event only causes another scoped revalidation. No
// derived business counts or permissions are stored in the client document.
async function invalidateCoachPage(db, fieldValue, clientId, domain) {
  try {
    await db.collection('clients').doc(clientId).update({[domain]:fieldValue.serverTimestamp()});
  } catch(error) {
    if(error.code!==5 && error.code!=='not-found')throw error;
  }
}
module.exports={invalidateCoachPage};
