const nodemailer=require('nodemailer');
async function sendReminder({to,subject,body}){
 const {SMTP_HOST:host,SMTP_USER:user,SMTP_PASS:pass}=process.env;
 if(!host||!user||!pass)throw Object.assign(new Error('SMTP indisponible'),{definitelyNotSent:true});
 const port=Number(process.env.SMTP_PORT||465);
 const transport=nodemailer.createTransport({host,port,secure:process.env.SMTP_SECURE?['true','1'].includes(process.env.SMTP_SECURE):port===465,auth:{user,pass},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:8000});
 const result=await transport.sendMail({from:process.env.SMTP_FROM||user,to,subject,text:body});
 if(!result.accepted?.length)throw Object.assign(new Error('Destinataire refusé'),{definitelyNotSent:true});
}
module.exports={sendReminder};
