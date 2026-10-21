// One commit prevents a completed session without its submitted feedback.
// The feedback uses the completion ID, so retries replace rather than duplicate it.
export async function commitSessionFeedback({batch, completionRef, completionData, feedbackRef, feedback}) {
  batch.set(completionRef, completionData, {merge:true});
  if (feedbackRef && feedback) batch.set(feedbackRef, feedback, {merge:true});
  await batch.commit();
}
