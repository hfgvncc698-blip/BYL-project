import {orderBy,startAt,endBefore,query,Timestamp} from 'firebase/firestore';
import {calendarWindow} from './calendarWindow.mjs';

// A cursor on the ordered date field partitions the result even for values of
// different Firestore types. The two tails include legacy numbers and strings.
export function calendarSlices(ref,field='start',date=new Date()){
  const [from,to]=calendarWindow(date,'week');
  const a=Timestamp.fromMillis(from),b=Timestamp.fromMillis(to);
  const sorted=query(ref,orderBy(field));
  return [query(sorted,startAt(a),endBefore(b)),query(sorted,endBefore(a)),query(sorted,startAt(b))];
}
