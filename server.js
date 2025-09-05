// =================================================================
// BACKEND COMPLETO - LOJA EDUCACIONAL (VERSÃO NODE.JS PARA RENDER)
// =================================================================

// 1. Importação das bibliotecas
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// 2. Configuração inicial
const app = express();
const PORT = process.env.PORT || 3000; // O Render define a porta automaticamente

// Middlewares
app.use(cors()); // Libera o CORS para qualquer origem
app.use(express.json()); // Permite que o Express entenda JSON no corpo das requisições

// Carrega variáveis de ambiente do arquivo .env (em desenvolvimento)
// Em produção (Render), as variáveis são configuradas na plataforma.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ==================== CONFIGURAÇÕES GERAIS ====================
const CONFIG = {
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Corrige quebras de linha
    planilhaProdutosId: process.env.PLANILHA_PRODUTOS_ID,
    planilhaPedidosId: process.env.PLANILHA_PEDIDOS_ID,
  },
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN,
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
  },
  urls: {
    sucesso: process.env.FRONTEND_URL_SUCESSO,
    falha: process.env.FRONTEND_URL_FALHA,
    pendente: process.env.FRONTEND_URL_PENDENTE,
  }
};

// ==================== INICIALIZAÇÃO DOS SERVIÇOS ====================

// Autenticação com Google Sheets
const serviceAccountAuth = new JWT({
  email: CONFIG.google.serviceAccountEmail,
  key: CONFIG.google.privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
} );
const docProdutos = new GoogleSpreadsheet(CONFIG.google.planilhaProdutosId, serviceAccountAuth);
const docPedidos = new GoogleSpreadsheet(CONFIG.google.planilhaPedidosId, serviceAccountAuth);

// Cliente do Mercado Pago
const mpClient = new MercadoPagoConfig({ accessToken: CONFIG.mercadoPago.accessToken });
const preference = new Preference(mpClient);

// ==================== FUNÇÕES AUXILIARES ====================

// Função para carregar produtos da planilha
async function getProdutos() {
  await docProdutos.loadInfo();
  const sheet = docProdutos.sheetsByIndex[0];
  const rows = await sheet.getRows();
  
  // Mapeia as linhas para o formato de objeto que o frontend espera
  const produtos = rows.map(row => {
    const produtoData = row.toObject();
    // Coleta todas as URLs de imagem em um array
    const imagens = [];
    for (let i = 1; i <= 5; i++) {
      if (produtoData[`url_imagem${i}`]) imagens.push(produtoData[`url_imagem${i}`]);
      if (produtoData[`urlimagem${i}`]) imagens.push(produtoData[`urlimagem${i}`]);
    }
    
    return {
      ID: produtoData.id,
      Nome: produtoData.nome,
      Descrição: produtoData.descricao,
      DescriçãoCompleta: produtoData.descricaocompleta,
      Preço: produtoData.preco,
      Categoria: produtoData.categoria,
      Imagens: imagens,
      URL_Imagem: imagens[0] || 'https://via.placeholder.com/300x300?text=Sem+Imagem',
    };
  } );
  return produtos;
}

// ==================== ENDPOINTS DA API ====================

// Endpoint de teste para verificar se o servidor está no ar
app.get('/', (req, res) => {
  res.status(200).json({
    mensagem: "Backend da Loja da Profe funcionando!",
    versao: "1.0.0-node",
    status: "online"
  });
});

// Endpoint para buscar todos os produtos
app.get('/produtos', async (req, res) => {
  try {
    const produtos = await getProdutos();
    res.status(200).json(produtos);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    res.status(500).json({ error: "Erro interno ao buscar produtos da planilha." });
  }
});

// Endpoint para buscar um produto por ID
app.get('/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const produtos = await getProdutos();
    const produto = produtos.find(p => p.ID == id);

    if (produto) {
      res.status(200).json(produto);
    } else {
      res.status(404).json({ error: "Produto não encontrado." });
    }
  } catch (error) {
    console.error("Erro ao buscar produto por ID:", error);
    res.status(500).json({ error: "Erro interno ao buscar o produto." });
  }
});

// Endpoint para criar uma preferência de pagamento no Mercado Pago
app.post('/create_preference', async (req, res) => {
  try {
    const { items, payer } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Itens são obrigatórios para criar a preferência." });
    }

    const preferenceData = {
      body: {
        items: items.map(item => ({
          id: item.id,
          title: item.title,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          currency_id: 'BRL',
        })),
        payer: {
          name: payer.name,
          email: payer.email,
        },
        back_urls: {
          success: CONFIG.urls.sucesso,
          failure: CONFIG.urls.falha,
          pending: CONFIG.urls.pendente,
        },
        auto_return: 'approved',
        // A URL de notificação deve ser a URL pública do seu backend no Render
        notification_url: `${req.protocol}://${req.get('host')}/webhook_mp?secret=${CONFIG.mercadoPago.webhookSecret}`,
      }
    };

    const result = await preference.create(preferenceData);

    res.status(201).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });

  } catch (error) {
    console.error("Erro ao criar preferência no Mercado Pago:", error.cause || error.message);
    res.status(500).json({ error: "Falha ao comunicar com o Mercado Pago." });
  }
});

// Endpoint para receber webhooks do Mercado Pago
app.post('/webhook_mp', async (req, res) => {
  // Valida o secret do webhook
  if (req.query.secret !== CONFIG.mercadoPago.webhookSecret) {
    console.warn("Webhook recebido com secret inválido.");
    return res.status(403).send("Acesso negado.");
  }

  const { type, data } = req.body;

  if (type === 'payment') {
    const paymentId = data.id;
    console.log(`Webhook de pagamento recebido para o ID: ${paymentId}`);
    
    // Aqui você implementaria a lógica para buscar os detalhes do pagamento
    // e salvar o pedido na sua planilha de "Pedidos"
    try {
        // Exemplo:
        // const paymentDetails = await mercadopago.payment.findById(paymentId);
        // if (paymentDetails.body.status === 'approved') {
        //   await salvarPedidoAprovado(paymentDetails.body);
        // }
        console.log("Processando pagamento aprovado (lógica a ser implementada)...");

    } catch (error) {
        console.error("Erro ao processar webhook:", error);
    }
  }

  // Responde ao Mercado Pago que o webhook foi recebido com sucesso
  res.status(200).send("Webhook recebido.");
});


// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
