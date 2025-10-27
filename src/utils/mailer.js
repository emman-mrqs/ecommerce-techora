// src/utils/mailer.js
import 'dotenv/config';
import nodemailer from 'nodemailer';

const isDev = process.env.NODE_ENV !== 'production';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  logger: false,
  debug: false,
  tls: { minVersion: 'TLSv1.2' },
  connectionTimeout: 20_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
});

export default transporter;
