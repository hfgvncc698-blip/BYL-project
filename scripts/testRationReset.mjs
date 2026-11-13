import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/components/RationAutoGenerator.jsx','utf8');
const start=source.indexOf('    if (autoInitDone.current && !redistributeRequested.current) return;');
const end=source.indexOf('  }, [',start);
const body=source.slice(start,end);
const old={modified:{manualQuantity:true,multiplier:8}};
let current=old,builds=0;
const c={autoInitDone:{current:true},redistributeRequested:{current:false},blocked:false,kcalIndicatif:2200,kcalTarget:2200,
 initialState:{slots:old},num:Number,JSON,
 buildDefaultSlots:()=>{builds++;return {fresh:{multiplier:1}};},computeTotals:()=>({day:{kcal:2200}}),
 adjustSlotsForTarget:x=>x,sanitizeSlotsHard:x=>x,normalizeSlotsToFamilyDefaults:x=>x,
 slotDefById:{},reg:{},path:{},caps:{},setSlots:fn=>{current=fn(current);}};
vm.createContext(c);
vm.runInContext('(function(){'+body+'})()',c);assert.equal(builds,0);assert.equal(current,old,'opening/cancel must leave edits intact');
c.redistributeRequested.current=true;c.blocked=true;
vm.runInContext('(function(){'+body+'})()',c);assert.equal(builds,0);
c.blocked=false;
vm.runInContext('(function(){'+body+'})()',c);assert.equal(builds,1);assert.equal(current.modified,undefined);assert.equal(current.fresh.multiplier,1);assert.equal(c.redistributeRequested.current,false);
vm.runInContext('(function(){'+body+'})()',c);assert.equal(builds,1,'no repeated reset on subsequent renders');
assert.match(source.slice(end,end+100),/resetRevision/,'explicit confirmation retriggers existing generator');
console.log('PASS reset uses fresh slots despite saved/manual overrides, respects block, consumes request once; unchanged state without confirmation');
