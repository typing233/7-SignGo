export function sendSigningEmail(to: string, name: string, token: string) {
  const link = `http://localhost:5173/sign/${token}`;
  console.log('═══════════════════════════════════════════');
  console.log(`📧 发送签署邮件`);
  console.log(`收件人: ${name} <${to}>`);
  console.log(`签署链接: ${link}`);
  console.log('═══════════════════════════════════════════');
}
