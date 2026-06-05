import nodemailer from "nodemailer";
import logger from "../utils/logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.163.com",
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailParams): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME || "区域数据分析平台"} <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: html || text,
    });
    logger.info({ messageId: info.messageId, to }, "Email sent");
    return true;
  } catch (err: any) {
    logger.error({ err, to }, "Email send failed");
    return false;
  }
}