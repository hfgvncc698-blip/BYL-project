function lifecycleValue(data, name, suffix) {
  return data?.lifecycleEmails?.[`${name}${suffix}`] || data?.[`lifecycleEmails.${name}${suffix}`];
}
const dueFields = {programCompleted:'completionEmailDueAt', inactivity:'inactiveReminderDueAt'};

// Archive a consumed due date only if this exact version is still current.
async function retireSentSchedule(snapshot, kind, field, FieldValue) {
  const data = snapshot.data();
  const parts = snapshot.ref.path.split('/');
  if (parts.length !== 4 || parts[0] !== 'clients' || parts[2] !== 'programmes' ||
      !data[field] || dueFields[kind] !== field || !lifecycleValue(data, kind, 'SentAt')) return;
  const patch = {};
  for (const [type, due] of Object.entries(dueFields)) {
    if (type !== kind && !(data[due]?.toMillis?.() <= Date.now() && lifecycleValue(data, type, 'SentAt'))) continue;
    patch[`lifecycleEmails.${type}ScheduledFor`] = data[due];
    patch[due] = FieldValue.delete();
  }
  try {
    await snapshot.ref.update(patch, { lastUpdateTime: snapshot.updateTime });
  } catch (error) {
    // A changed or removed schedule is reconciled from its new state on the next run.
    if (![5, 9, 'not-found', 'failed-precondition'].includes(error.code)) throw error;
  }
}

function sameDueDate(expected, current) {
  if (expected?.isEqual) return Boolean(current?.isEqual && expected.isEqual(current));
  return expected != null && expected === current;
}
async function retireSentSchedules(docs, kind, field, FieldValue) {
  for (let start = 0; start < docs.length; start += 20) {
    const results = await Promise.allSettled(docs.slice(start, start + 20)
      .map(doc => retireSentSchedule(doc, kind, field, FieldValue)));
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) console.warn('[lifecycle schedule] failed retirements', failed);
  }
}
module.exports = { lifecycleValue, retireSentSchedule, retireSentSchedules, sameDueDate };
