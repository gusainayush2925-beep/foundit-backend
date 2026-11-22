require('dotenv').config();
const sendEmail = require('./src/utils/sendEmail');

console.log('=== TESTING EMAIL ===');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_HOST:', process.env.EMAIL_HOST);

sendEmail({
    email: 'gusainayush2925@gmail.com',   // ← YEH
    subject: 'FoundIt Test Email',
    html: '<h1>🎉 Test Successful!</h1>'
})
.then(() => {
    console.log('✅ TEST PASSED - Check your Gmail inbox!');
    process.exit(0);
})
.catch((err) => {
    console.log('❌ TEST FAILED:', err.message);
    process.exit(1);
});