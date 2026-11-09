// Test-process counters. No document contents or identifiers leave the process.
module.exports=function install(db){
  let listeners=0,inside=false;
  for(const ref of [db.collection('fixture').where('k','==',0),db.doc('fixture/sample')]){
    const proto=Object.getPrototypeOf(ref), original=proto.onSnapshot;
    proto.onSnapshot=function(...args){
      if(inside) return original.apply(this,args);
      inside=true;
      let unsubscribe;
      try {unsubscribe=original.apply(this,args);} finally{inside=false;}
      listeners++;
      let open=true;
      return ()=>{if(open){open=false;listeners--;}unsubscribe();};
    };
  }
  const original=db.runTransaction.bind(db);
  db.runTransaction=async(fn,...options)=>{
    let writes=0;
    const result=await original(async tx=>{
      writes=0;
      for(const method of ['set','update','delete','create']){
        const op=tx[method].bind(tx);
        tx[method]=(...args)=>{writes++;return op(...args);};
      }
      return fn(tx);
    },...options);
    if(writes)process.send({writeCount:writes});
    return result;
  };
  process.on('message',m=>{
    if(m.resources)process.send({resources:{...process.memoryUsage(),listeners}});
  });
};
