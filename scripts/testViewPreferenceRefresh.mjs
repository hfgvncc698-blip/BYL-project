import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {tabSessionStorage} from '../src/utils/privateStorage.js';
import {admitPrivateSession,lockPrivateSession} from '../src/utils/privateSession.js';
const native=new Map();
globalThis.window={sessionStorage:{getItem:k=>native.get(k)??null,setItem:(k,v)=>native.set(k,v),removeItem:k=>native.delete(k)}};
const source=fs.readFileSync('src/AuthContext.jsx','utf8');
const start=source.indexOf('  const [viewAs, _setViewAs] = useState(');
const end=source.indexOf('\n  });',start)+'\n  });'.length;
const init=source.slice(start,end)+'\nthis.result=viewAs;';
const read=()=>{const c={tabSessionStorage,VIEW_AS_KEY:'BYL_VIEW_AS',useState:f=>[f(),()=>{}]};vm.createContext(c);vm.runInContext(init,c);return c.result;};
for(const mode of ['admin','coach']){
 admitPrivateSession('synthetic-admin','admin');tabSessionStorage.setItem('BYL_VIEW_AS',mode);
 tabSessionStorage.setItem('private-fixture','secret');lockPrivateSession();
 assert.equal(read(),mode,'refresh initialization preserves '+mode);
 assert.equal(tabSessionStorage.getItem('private-fixture'),null);
 assert.equal(native.has('private-fixture'),false,'no private data persisted');
}
tabSessionStorage.setItem('BYL_VIEW_AS','invalid-role');assert.equal(read(),null);
tabSessionStorage.removeItem('BYL_VIEW_AS');assert.equal(read(),null);
const roleStart=source.indexOf('  const effectiveRole = useMemo(');
const roleEnd=source.indexOf('\n  }, [user?.role, viewAs]);',roleStart)+'\n  }, [user?.role, viewAs]);'.length;
for(const role of ['coach','particulier','club']){
 const c={user:{role},viewAs:'admin',useMemo:fn=>fn()};vm.createContext(c);vm.runInContext(source.slice(roleStart,roleEnd)+'\nthis.result=effectiveRole;',c);assert.equal(c.result,role,'display preference cannot grant admin rights');
}
console.log('PASS admin/coach refresh restoration, invalid value rejection, private cache clearing, no privilege escalation');
