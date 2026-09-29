async function sendSms(to, message){
    //todo: replace with a real SMS provider
    console.log('[SMS stub] to ${to.slice(0, 6)}****: ${message.slice(0, 40)}...');
    return true;
}
module.exports = { sendSms };