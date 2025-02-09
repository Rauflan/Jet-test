// server.js
require('dotenv').config();
const express = require('express');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

let channel, connection;

// Função para conectar ao RabbitMQ
async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(process.env.RABBITMQ_QUEUE, { durable: true });
    console.log('Conectado ao RabbitMQ');
  } catch (error) {
    console.error('Erro ao conectar com o RabbitMQ:', error);
  }
}

// Endpoint para receber a requisição de envio de mensagem
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Parâmetros "phone" e "message" são obrigatórios.' });
  }
  
  // Cria o payload que será enviado para o consumer
  const msgPayload = { phone, message, timestamp: new Date().toISOString() };
  
  try {
    // Publica a mensagem na fila do RabbitMQ
    channel.sendToQueue(
      process.env.RABBITMQ_QUEUE,
      Buffer.from(JSON.stringify(msgPayload)),
      { persistent: true }
    );
    res.status(200).json({ message: 'Mensagem enfileirada para envio.' });
  } catch (error) {
    console.error('Erro ao enviar mensagem para a fila:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  await connectRabbitMQ();
});
