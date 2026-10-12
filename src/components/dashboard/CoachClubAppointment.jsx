import { useCallback, useEffect, useRef, useState } from 'react';
import { useColorModeValue, useToast } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import ClubAppointmentDialog from './ClubAppointmentDialog';
import { apiFetch } from '../../utils/api';
import { clubText } from '../../i18n/clubText';
const localDate = date => {const d=new Date(date);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
export default function CoachClubAppointment({event,isOpen,onClose,onSaved}) {
 const {i18n,t}=useTranslation(),toast=useToast();
 const [appointment,setAppointment]=useState(null),[form,setForm]=useState({}),[clients,setClients]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState('');
 const request=useRef(0);
 const tileBg=useColorModeValue('gray.50','whiteAlpha.50'),mutedText=useColorModeValue('gray.600','gray.400');
 const id=event._sourceId;
 const load=useCallback(async()=>{
  const version=++request.current;setLoading(true);setError('');
  try {
   const [detail,roster,directory]=await Promise.all([apiFetch(`/clubs/appointments/${id}`),apiFetch(`/clubs/coach-appointments/${id}/participants`),apiFetch('/clubs/client-directory')]);
   if(request.current!==version)return;
   const a=detail.appointment;
   setAppointment({...a,start:new Date(a.startsAt)});
   setForm({...a,notifyParticipants:false,startsAt:localDate(a.startsAt)});
   setClients(directory.clients.map(c=>({...c,packs:roster.clients.find(r=>r.id===c.id)?.packs||[]})));
  } catch(e){if(request.current===version)setError(clubText(e.data?.error||'Chargement impossible.'));}
  finally{if(request.current===version)setLoading(false);}
 },[id]);
 useEffect(()=>{if(isOpen)load();return()=>{request.current++;};},[load,isOpen]);
 const save=async()=>{
  setSaving(`appointment:${id}`);
  try{const result = await apiFetch(`/clubs/appointments/${id}`,{method:'PATCH',body:JSON.stringify({notifyParticipants:form.notifyParticipants === true,title:form.title,status:form.status,startsAt:new Date(form.startsAt).toISOString(),durationMin:form.durationMin,note:form.note||'',capacity:form.capacity,participantIds:form.participantIds,waitlistIds:form.waitlistIds,expectedReservations:{participantIds:appointment.participantIds||[],waitlistIds:appointment.waitlistIds||[]}})} ); if(form.notifyParticipants) toast({status:result.emailDelivery?.failed ? 'warning':'info', title:clubText('Inscription enregistrée'), description:t('calendar.email_delivery_result', '{{sent}} envoyé(s) · {{skipped}} non envoyé(s) (préférences ou adresse) · {{failed}} échec(s)', {sent:result.emailDelivery?.sent || 0, skipped:result.emailDelivery?.skipped || 0, failed:result.emailDelivery?.failed || 0})});onSaved();onClose();}
  catch(e){toast({status:'error',title:clubText(e.data?.error||'Enregistrement impossible.')});}finally{setSaving('');}
 };
 const remove=async()=>{
  setSaving(`appointment:${id}:delete`);
  try{await apiFetch(`/clubs/appointments/${id}`,{method:'DELETE'});onSaved();onClose();}
  catch(e){toast({status:'error',title:clubText(e.data?.error||'Enregistrement impossible.')});}finally{setSaving('');}
 };
 return <ClubAppointmentDialog appointmentDetailModal={{isOpen,onClose}} appointmentDetailLoading={loading} appointmentDetailError={error} appointmentDetailRequest={request} openAppointmentDetail={load} selectedAppointment={appointment} theme={{tileProps:{bg:tileBg,borderWidth:'1px',borderRadius:'16px'},mutedText,inputProps:{},primaryButtonProps:{colorScheme:'blue'}}} formatShortDateTime={date=>date?new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(date):''} appointmentEditForm={form} setAppointmentEditForm={setForm} coaches={appointment?[{uid:appointment.coachUid,name:appointment.coachName}]:[]} displayName={c=>c.name} groupClients={clients} groupClientsLoading={loading} groupClientsError={error} actionSaving={saving} saveAppointmentEdit={save} deleteAppointment={remove} lockCoach/>;
}
