# Backend Loja da Profe

Backend Node.js para a Loja Educacional da Profe, integrado com Google Sheets e Mercado Pago.

## Como rodar localmente

1. `npm install`
2. Criar arquivo `.env` com variáveis:
   - FRONTEND_URL
   - GOOGLE_SERVICE_ACCOUNT_EMAIL
   - GOOGLE_PRIVATE_KEY
   - PLANILHA_PRODUTOS_ID
   - PLANILHA_PEDIDOS_ID
   - MP_ACCESS_TOKEN
   - MP_WEBHOOK_SECRET
   - FRONTEND_URL_SUCESSO
   - FRONTEND_URL_FALHA
   - FRONTEND_URL_PENDENTE
3. `npm start`

## Endpoints

- GET / → verifica se o backend está rodando
- GET /produtos → retorna lista de produtos
- GET /produtos/:id → retorna produto por ID
- POST /create_preference → cria preferência no Mercado Pago
- POST /webhook_mp → recebe webhook do Mercado Pago
