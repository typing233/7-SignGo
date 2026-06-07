import nodemailer from 'nodemailer';
import { getAll } from '../db/connection';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const baseUrl = () => process.env.APP_URL || 'http://localhost:5173';

function sendMail(to: string, subject: string, html: string) {
  const mailOptions = {
    from: `"SignGo 电子签署" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions).then(() => {
    console.log(`[Email] Sent to: ${to} | Subject: ${subject}`);
  }).catch((error) => {
    console.error(`[Email] Failed to: ${to}`, error);
    console.log(`[Email Fallback] To: ${to} | Subject: ${subject}`);
  });
}

export async function sendSigningEmail(to: string, name: string, token: string) {
  const link = `${baseUrl()}/sign/${token}`;
  const html = `
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
  `;
  await sendMail(to, '您有一份文档待签署 - SignGo', html);
}

export async function sendCompletionEmail(to: string, name: string, processTitle: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #10B981;">签署完成通知</h2>
      <p>${name}，您好！</p>
      <p>文档 <strong>"${processTitle}"</strong> 的所有签署方已全部完成签署。</p>
      <p>您可以登录 SignGo 下载已签署的最终文档。</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${baseUrl()}" style="background-color: #10B981; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 16px;">
          查看文档
        </a>
      </div>
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">此邮件由 SignGo 电子签署平台自动发送，请勿回复。</p>
    </div>
  `;
  await sendMail(to, `签署已完成: ${processTitle} - SignGo`, html);
}

export async function sendRejectionEmail(to: string, name: string, processTitle: string, rejectorName: string, reason: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #EF4444;">签署被拒绝</h2>
      <p>${name}，您好！</p>
      <p>文档 <strong>"${processTitle}"</strong> 已被 <strong>${rejectorName}</strong> 拒绝签署。</p>
      ${reason ? `<p>拒绝原因：${reason}</p>` : ''}
      <p>您可以登录 SignGo 查看详情。</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${baseUrl()}" style="background-color: #EF4444; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 16px;">
          查看详情
        </a>
      </div>
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">此邮件由 SignGo 电子签署平台自动发送，请勿回复。</p>
    </div>
  `;
  await sendMail(to, `签署被拒绝: ${processTitle} - SignGo`, html);
}

export async function sendReminderEmail(to: string, name: string, token: string, processTitle: string) {
  const link = `${baseUrl()}/sign/${token}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #F59E0B;">签署提醒</h2>
      <p>${name}，您好！</p>
      <p>您有一份文档 <strong>"${processTitle}"</strong> 仍需签署，请尽快完成。</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background-color: #F59E0B; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 16px;">
          立即签署
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">如果按钮无法点击，请复制以下链接到浏览器：</p>
      <p style="color: #F59E0B; font-size: 14px; word-break: break-all;">${link}</p>
      <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">此邮件由 SignGo 电子签署平台自动发送，请勿回复。</p>
    </div>
  `;
  await sendMail(to, `签署提醒: ${processTitle} - SignGo`, html);
}

export async function triggerWebhooks(userId: number, event: string, payload: any) {
  const configs = getAll(
    "SELECT * FROM webhook_configs WHERE user_id = ? AND active = 1",
    [userId]
  );

  for (const config of configs) {
    const events = config.events.split(',');
    if (!events.includes(event) && !events.includes('*')) continue;

    try {
      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.secret) {
        const crypto = await import('crypto');
        const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
        headers['X-SignGo-Signature'] = signature;
      }

      await fetch(config.url, { method: 'POST', headers, body });
      console.log(`[Webhook] Sent ${event} to ${config.url}`);
    } catch (err) {
      console.error(`[Webhook] Failed ${event} to ${config.url}`, err);
    }
  }
}
