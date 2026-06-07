import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendSigningEmail(to: string, name: string, token: string) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${baseUrl}/sign/${token}`;

  const mailOptions = {
    from: `"SignGo 电子签署" <${process.env.GMAIL_USER}>`,
    to,
    subject: '您有一份文档待签署 - SignGo',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563EB;">SignGo 电子签署</h2>
        <p>${name}，您好！</p>
        <p>您有一份文档需要签署，请点击下方按钮完成签署：</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #2563EB; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 16px;">
            立即签署
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">如果按钮无法点击，请复制以下链接到浏览器：</p>
        <p style="color: #2563EB; font-size: 14px; word-break: break-all;">${link}</p>
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">此邮件由 SignGo 电子签署平台自动发送，请勿回复。</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 签署邮件已发送至: ${name} <${to}>`);
  } catch (error) {
    console.error(`❌ 邮件发送失败:`, error);
    // Fallback: print link to console so workflow isn't blocked
    console.log('═══════════════════════════════════════════');
    console.log(`📧 邮件发送失败，签署链接如下：`);
    console.log(`收件人: ${name} <${to}>`);
    console.log(`签署链接: ${link}`);
    console.log('═══════════════════════════════════════════');
  }
}
