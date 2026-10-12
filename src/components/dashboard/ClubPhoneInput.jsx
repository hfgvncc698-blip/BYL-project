import React, { useEffect, useState } from 'react';
import { HStack, Input, Select } from '@chakra-ui/react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { clubText, clubLocale } from '../../i18n/clubText';

export default function ClubPhoneInput({ value='', onChange, isReadOnly=false }) {
  const [country,setCountry]=useState(()=>parsePhoneNumberFromString(value)?.country||'FR');
  useEffect(()=>{const detected=parsePhoneNumberFromString(value)?.country;if(detected)setCountry(detected);},[value]);
  const names=new Intl.DisplayNames([clubLocale()],{type:'region'});
  const countries=getCountries().sort((a,b)=>names.of(a).localeCompare(names.of(b),clubLocale()));
  const normalize=()=>{const parsed=parsePhoneNumberFromString(value.replace(/^00/,'+'),country);if(parsed?.isPossible())onChange(parsed.number);};
  return <HStack align="stretch" spacing={2}>
    <Select aria-label={clubText('Indicatif du pays')} value={country} isDisabled={isReadOnly} w={{base:'130px',md:'170px'}} flexShrink={0} onChange={e=>{
      const next=e.target.value;setCountry(next);
      if(value){const previous=parsePhoneNumberFromString(value,country);const national=previous?.nationalNumber||value;const parsed=parsePhoneNumberFromString(national,next);onChange(parsed?.number||`+${getCountryCallingCode(next)} ${national}`);}
    }}>{countries.map(code=><option key={code} value={code}>{names.of(code)} (+{getCountryCallingCode(code)})</option>)}</Select>
    <Input type="tel" aria-label={clubText('Téléphone')} autoComplete="tel" minW={0} isReadOnly={isReadOnly} value={value} onChange={e=>onChange(e.target.value)} onBlur={normalize}/>
  </HStack>;
}
