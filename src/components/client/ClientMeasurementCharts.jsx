import React, { useState } from 'react';
import { Box, Text, Flex, SimpleGrid, Button, Menu, MenuButton, MenuList, MenuOptionGroup, MenuItemOption, Portal, Badge } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import BodyMeasureChart from '../stats/BodyMeasureChart';
import MeasurementHelp from '../stats/MeasurementHelp';
import { clientStatsLabels } from '../../i18n/clientStats';
import { calculateEntryBmi } from '../../utils/measurementEntry';
import { formatFeetInches } from '../../utils/imperialHeight';

const fields = [['height','taille'],['weight','poids'],['bmi','bmi'],['fat','fatMass'],['muscle','muscleMass'],['water','waterMass'],['bone','boneMass'],['metabolicAge','metabolicAge'],['visceralFat','visceralFatScore']];
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export default function ClientMeasurementCharts({measures=[],profile={},heightUnit='cm',weightUnit='kg',subtlePanelBg,panelBorder,lineStroke}) {
  const {t,i18n}=useTranslation();
  const labels=clientStatsLabels(i18n.language);
  const [showAll,setShowAll]=useState(false);
  const [selection,setSelection]=useState(null);
  const nf=new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1});
  const label=(key,field)=>{
    const raw=t(`stats.fields.${key}`);
    if(field==='taille')return raw.replace('(cm)',heightUnit==='cm'?'(cm)':'(ft/in)');
    if(['poids','muscleMass','boneMass'].includes(field))return raw.replace('(kg)',weightUnit==='kg'?'(kg)':'(lb)');
    return raw;
  };
  const value=(entry,field)=>{
    const raw=field==='bmi'?(calculateEntryBmi(entry.taille,entry.poids)??number(entry.bmi)):number(entry[field]);
    if(raw==null)return null;
    if(field==='taille' && heightUnit!=='cm')return raw/2.54;
    if(['poids','muscleMass','boneMass'].includes(field) && weightUnit!=='kg')return raw*2.20462262185;
    return raw;
  };
  const ordered=[...measures].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const charts=fields.map(([key,field])=>({key,field,data:ordered.map(entry=>({date:entry.date,value:value(entry,field)})).filter(entry=>entry.value!=null)})).filter(chart=>chart.data.length>=2);
  const selected=selection??[charts.some(c=>c.field==='poids')?'poids':charts[0]?.field];
  return <>
    <SimpleGrid columns={{base:1,sm:2,xl:showAll?4:3}} gap={3} mb={4}>
      {fields.filter(([,field])=>showAll||['poids','fatMass','muscleMass'].includes(field)).map(([key,field])=>{
        const latest=[...ordered].reverse().map(entry=>value(entry,field)).find(v=>v!=null)??value(profile||{},field);
        return <Flex key={field} bg={subtlePanelBg} borderWidth="1px" borderColor={panelBorder} borderRadius="20px" p={4} gap={3} align="center" justify="space-between" dir="ltr">
          <Text fontSize="sm" minW={0} flex="1" dir={i18n.dir()} textAlign="left">{label(key,field)}</Text>
          <Text fontSize={{base:'2xl',md:'3xl'}} fontWeight="800" flexShrink={0} textAlign="right">{latest==null?'—':field==='taille' && heightUnit!=='cm'?formatFeetInches(latest):nf.format(latest)}</Text>
        </Flex>;
      })}
    </SimpleGrid>
    <Flex justify="flex-end" mb={5}><Button size="sm" variant="outline" borderRadius="full" aria-expanded={showAll} onClick={()=>setShowAll(v=>!v)}>{showAll?labels.less:labels.more}</Button></Flex>
    {charts.length>0 ? <>
      <Flex justify="flex-end" mb={4}>
        <Menu closeOnSelect={false} placement="bottom-end">
          <MenuButton as={Button} size="sm" variant="outline" borderRadius="full" rightIcon={<ChevronDownIcon/>}>{labels.chart} ({selected.filter(f=>charts.some(c=>c.field===f)).length})</MenuButton>
          <Portal><MenuList maxH="360px" overflowY="auto" maxW="calc(100vw - 32px)" borderRadius="18px" zIndex={1400}>
            <MenuOptionGroup type="checkbox" value={selected} onChange={v=>setSelection(Array.isArray(v)?v:[])}>
              {charts.map(c=><MenuItemOption key={c.field} value={c.field}>{label(c.key,c.field)}</MenuItemOption>)}
            </MenuOptionGroup>
          </MenuList></Portal>
        </Menu>
      </Flex>
      <SimpleGrid columns={{base:1,md:2}} gap={4}>
        {charts.filter(c=>selected.includes(c.field)).map(c=><Box key={c.field} bg={subtlePanelBg} borderWidth="1px" borderColor={panelBorder} p={4} borderRadius="24px" minW={0}>
          <Flex justify="space-between" gap={2} mb={3}><Text fontWeight="600" fontSize="sm">{label(c.key,c.field)}</Text><Badge borderRadius="full">{c.data.length} {t('auto.StatisticsPageClient.points','points')}</Badge></Flex>
          <BodyMeasureChart data={c.data} borderColor={panelBorder} strokeColor={lineStroke} locale={i18n.language} valueLabel={label(c.key,c.field)} valueFormatter={c.field==='taille' && heightUnit!=='cm'?formatFeetInches:undefined}/>
          <MeasurementHelp metric={c.key} profile={profile} data={c.data} valueFormatter={c.field==='taille' && heightUnit!=='cm'?formatFeetInches:undefined}/>
        </Box>)}
      </SimpleGrid>
    </> : <Text fontSize="sm">{t('auto.StatisticsPageClient.ajoute_au_moins_deux_releves_pour_afficher_des_cou','Ajoute au moins deux relevés pour afficher des courbes d’évolution exploitables.')}</Text>}
  </>;
}
