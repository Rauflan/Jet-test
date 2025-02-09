
require('dotenv').config();
const amqp = require('amqplib');
const { Client: PgClient } = require('pg');
// Importa o cliente do whatsapp-web.js
const { Client: WhatsAppClient } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Configuração do Postgres
const pgClient = new PgClient({
  connectionString: process.env.POSTGRES_URL,
});
pgClient.connect().then(() => console.log('Conectado ao Postgres')).catch(console.error);

// Inicialização do WhatsApp Client
const whatsappClient = new WhatsAppClient();

whatsappClient.on('qr', (qr) => {
  // Exibe o QR code para autenticação via terminal
  console.log('QR Code recebido, escaneie com seu celular:');
  qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
  console.log('Cliente WhatsApp está pronto!');
});

whatsappClient.initialize();

// Função para salvar o log da mensagem no Postgres
async function saveLog(phone, message, status) {
  try {
    await pgClient.query(
      'INSERT INTO message_logs (phone, message, status, created_at) VALUES ($1, $2, $3, NOW())',
      [phone, message, status]
    );
  } catch (error) {
    console.error('Erro ao salvar log no Postgres:', error);
  }
}

// Função para processar cada mensagem da fila
async function processMessage(msg) {
  let payload;
  try {
    const content = msg.content.toString();
    payload = JSON.parse(content);
    const { phone, message } = payload;
    
    // Formata o número para o formato esperado pelo whatsapp-web.js
    // Geralmente, o WhatsApp espera o ID no formato <número>@c.us
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;

    // Envia a mensagem via WhatsApp
    await whatsappClient.sendMessage(chatId, message);
    console.log(`Mensagem enviada para ${phone}`);
    
    // Registra log com status "ENVIADA"
    await saveLog(phone, message, 'ENVIADA');
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    
    // Em caso de erro, tenta registrar log com status "ERRO"
    if (payload && payload.phone && payload.message) {
      await saveLog(payload.phone, payload.message, 'ERRO');
    }
  }
}

// Função para conectar ao RabbitMQ e iniciar o consumo
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(process.env.RABBITMQ_QUEUE, { durable: true });
    console.log('Conectado ao RabbitMQ (Consumer)');
    
    channel.consume(process.env.RABBITMQ_QUEUE, async (msg) => {
      if (msg !== null) {
        await processMessage(msg);
        channel.ack(msg); // Confirma o processamento da mensagem
      }
    });
  } catch (error) {
    console.error('Erro ao conectar com o RabbitMQ no consumer:', error);
  }
}

connectRabbitMQ();
