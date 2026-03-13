# Guia de Ativacao Passo a Passo — Be Healthy Instagram Social Seller

> Siga cada passo na ordem. Cada secao diz exatamente onde clicar, o que colar, e como confirmar que funcionou.

---

## PASSO 1 — Criar o arquivo .env com suas chaves

### O que fazer:

1. Abra o terminal na pasta do projeto
2. Execute:
   ```bash
   cp config/env.example .env
   ```
3. Abra o arquivo `.env` no seu editor (VS Code, nano, etc.)
4. Substitua os valores conforme abaixo:

### Onde colar cada chave:

```
# Kommo CRM
KOMMO_BASE_URL=https://felipebhcrm.kommo.com/api/v4
KOMMO_ACCESS_TOKEN=<COLE SUA CHAVE KOMMO AQUI>

# OpenAI
OPENAI_API_KEY=<COLE SUA CHAVE OPENAI AQUI>
OPENAI_MODEL=gpt-4o

# Instagram / Meta
INSTAGRAM_VERIFY_TOKEN=<COLE OU CRIE UM TOKEN ALEATORIO AQUI>
META_APP_SECRET=<COLE O APP SECRET DO META AQUI>
META_ACCESS_TOKEN=<COLE O PAGE ACCESS TOKEN DO META AQUI>
INSTAGRAM_ACCOUNT_ID=<COLE O ID DA CONTA INSTAGRAM AQUI>

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<CRIE UMA SENHA PARA O N8N AQUI>
N8N_PORT=5678
WEBHOOK_URL=https://<SEU-DOMINIO>/webhook
```

### Onde encontrar cada chave:

| Chave | Onde pegar |
|-------|-----------|
| `KOMMO_ACCESS_TOKEN` | Kommo > Configuracoes (engrenagem) > Integracoes > Sua integracao > Chaves > Access Token |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys > Botao "Create new secret key" > Copiar |
| `META_APP_SECRET` | https://developers.facebook.com > Seu App > Configuracoes > Basico > Chave Secreta do App > Mostrar > Copiar |
| `META_ACCESS_TOKEN` | Facebook Developer > Ferramentas > Explorador da API do Graph > Selecione a pagina > Gerar Token de Acesso > Copiar |
| `INSTAGRAM_ACCOUNT_ID` | Explorador da API do Graph > GET `/me/accounts` para pegar Page ID > depois GET `/{page-id}?fields=instagram_business_account` > copie o valor de `instagram_business_account.id` |
| `INSTAGRAM_VERIFY_TOKEN` | Voce cria esse valor. Pode ser qualquer texto aleatorio. Exemplo: abra o terminal e rode `openssl rand -hex 16` e copie o resultado |
| `N8N_BASIC_AUTH_PASSWORD` | Voce cria essa senha. Use algo forte. |
| `WEBHOOK_URL` | O dominio publico onde seu n8n estara acessivel (ex: `https://n8n.seustio.com.br/webhook`) |

### Como saber se passou:

Salve o `.env` e rode no terminal:

```bash
# Testar Kommo
curl -s -H "Authorization: Bearer SEU_KOMMO_ACCESS_TOKEN" \
  "https://felipebhcrm.kommo.com/api/v4/account"
```
- **PASSOU**: Retorna JSON com o nome da sua conta
- **FALHOU**: Retorna `{"status":401}` ou erro de conexao

```bash
# Testar OpenAI
curl -s -H "Authorization: Bearer SUA_OPENAI_API_KEY" \
  "https://api.openai.com/v1/models" | head -c 200
```
- **PASSOU**: Retorna JSON com lista de modelos
- **FALHOU**: Retorna `{"error":{"message":"Incorrect API key..."}}`

```bash
# Testar Meta
curl -s "https://graph.facebook.com/v21.0/me?access_token=SEU_META_ACCESS_TOKEN"
```
- **PASSOU**: Retorna JSON com nome e ID da pagina
- **FALHOU**: Retorna `{"error":{"message":"Invalid OAuth access token"}}`

---

## PASSO 2 — Criar o Pipeline no Kommo

### O que fazer:

1. No terminal, na pasta do projeto, rode:
   ```bash
   npm run setup
   ```

### O que voce deve ver na tela:

```
Pipeline "SOCIAL SELLING INSTAGRAM" criado/encontrado
  Novo Seguidor ............. ID: 12345678
  Interacao Inicial ......... ID: 12345679
  Qualificacao .............. ID: 12345680
  Interesse Real ............ ID: 12345681
  Encaminhado Andrea ........ ID: 12345682
  Encaminhado Thais ......... ID: 12345683
  Consulta Agendada ......... ID: 12345684
  n8n env mapping saved to config/n8n-env-vars.json
```

### Como verificar:

1. Abra o arquivo `config/n8n-env-vars.json` — todos os valores devem ser numeros (nao `null` ou `"pending"`)
2. Abra o Kommo no navegador > Menu lateral > Pipelines > Deve aparecer "SOCIAL SELLING INSTAGRAM" com 7 etapas

### Como saber se passou:

- **PASSOU**: Arquivo `n8n-env-vars.json` tem todos os IDs numericos E pipeline aparece no Kommo
- **FALHOU**: Mensagem de erro no terminal, ou IDs com valor `null`/`NOT FOUND`

---

## PASSO 3 — Configurar e Importar Workflow no n8n

### 3A. Iniciar o n8n

1. No terminal, rode:
   ```bash
   npm run start:n8n
   ```
2. Aguarde ate ver: `Editor is now accessible via: http://localhost:5678`
3. Abra no navegador: `http://localhost:5678`
4. Faca login com usuario `admin` e a senha que voce definiu no `.env`

### 3B. Configurar Variaveis de Ambiente no n8n

1. No n8n, clique no **icone de engrenagem** (canto inferior esquerdo) > **Settings**
2. Clique em **Environment Variables** no menu lateral
3. Adicione CADA variavel abaixo clicando em **"Add Variable"**:

| Nome da Variavel | Onde pegar o valor |
|---|---|
| `KOMMO_BASE_URL` | Cole: `https://felipebhcrm.kommo.com/api/v4` |
| `KOMMO_ACCESS_TOKEN` | Cole o mesmo token do seu `.env` |
| `KOMMO_PIPELINE_ID` | Abra `config/n8n-env-vars.json` > copie o valor de `KOMMO_PIPELINE_ID` |
| `KOMMO_STATUS_NOVO_SEGUIDOR` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_INTERACAO_INICIAL` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_QUALIFICACAO` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_INTERESSE_REAL` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_ANDREA` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_THAIS` | Abra `config/n8n-env-vars.json` > copie o valor |
| `KOMMO_STATUS_CONSULTA_AGENDADA` | Abra `config/n8n-env-vars.json` > copie o valor |
| `OPENAI_API_KEY` | Cole o mesmo do seu `.env` |
| `OPENAI_MODEL` | Cole: `gpt-4o` |
| `META_ACCESS_TOKEN` | Cole o mesmo do seu `.env` |

4. **IMPORTANTE**: Depois de adicionar todas as variaveis, **reinicie o n8n** (pare com Ctrl+C no terminal e rode `npm run start:n8n` de novo). As variaveis de ambiente so sao carregadas na inicializacao.

### 3C. Criar Credencial do Kommo

1. No n8n, clique na **engrenagem** > **Credentials**
2. Clique em **"Add Credential"**
3. No campo de busca, digite: **Header Auth**
4. Selecione: **HTTP Header Auth**
5. Preencha:
   - **Credential Name**: `Kommo Bearer Auth`
   - **Name** (do header): `Authorization`
   - **Value** (do header): `Bearer <cole_seu_KOMMO_ACCESS_TOKEN_aqui>`

   Exemplo: se seu token e `abc123`, o valor deve ser: `Bearer abc123`
6. Clique em **"Save"**

### 3D. Importar o Workflow

1. Na tela principal do n8n, clique em **"..."** (menu) ou **"Import from file"**
   - Caminho alternativo: canto superior direito > **Import from File**
2. Navegue ate a pasta do projeto e selecione: `workflows/social-instagram-agent.json`
3. O workflow deve aparecer com **31 nodes** conectados

### 3E. Vincular Credencial nos Nodes HTTP

Agora voce precisa dizer a cada node HTTP para usar a credencial do Kommo. Faca isso para **cada um dos 8 nodes abaixo**:

1. **Clique duas vezes** no node para abrir
2. Na secao **"Authentication"**, selecione: **Header Auth**
3. No dropdown **"Credential"**, selecione: **Kommo Bearer Auth**
4. Clique em **"Back"** ou feche o painel

Repita para estes 8 nodes (eles sao os retangulos roxos/azuis no workflow):

| # | Nome do Node | Funcao |
|---|-------------|--------|
| 1 | **Check Contact in Kommo** | Busca contato existente |
| 2 | **Create Contact** | Cria novo contato |
| 3 | **Check Existing Lead** | Busca lead existente |
| 4 | **Create Lead** | Cria novo lead |
| 5 | **Add CRM Note** | Adiciona nota ao lead |
| 6 | **Update Pipeline Stage** | Atualiza etapa do pipeline |
| 7 | **Assign Lead to Operator** | Atribui lead para Andrea ou Thais |
| 8 | **Add Handoff Note** | Adiciona nota de handoff |

Depois de vincular todos, clique em **"Save"** (Ctrl+S).

### Como saber se passou:

- **PASSOU**: Workflow abre sem triangulos amarelos de aviso, todos os 8 HTTP nodes mostram "Kommo Bearer Auth" no dropdown de credencial
- **FALHOU**: Algum node mostra "credential not found" ou aparece aviso de variavel de ambiente faltando

---

## PASSO 4 — Configurar Webhook no Meta/Instagram

### 4A. Acessar o Meta Developer Console

1. Abra: https://developers.facebook.com
2. Clique em **"My Apps"** (canto superior direito)
3. Selecione o app da Be Healthy (ou crie um novo se nao existir)

### 4B. Adicionar Produtos ao App (se ainda nao tiver)

1. No menu lateral esquerdo, clique em **"Add Product"**
2. Encontre **"Webhooks"** > clique **"Set Up"**
3. Encontre **"Instagram"** > clique **"Set Up"**

### 4C. Configurar o Webhook

1. No menu lateral, clique em **"Webhooks"**
2. No dropdown superior, selecione **"Instagram"**
3. Clique em **"Subscribe to this object"** (ou "Edit Subscription" se ja existir)
4. Preencha:
   - **Callback URL**: `https://<seu-dominio>/webhook/instagram-webhook`
     - Exemplo: `https://n8n.behealthy.com.br/webhook/instagram-webhook`
   - **Verify Token**: Cole o **MESMO valor** que voce colocou em `INSTAGRAM_VERIFY_TOKEN` no `.env`
5. Clique em **"Verify and Save"**

### 4D. Assinar os Campos

Depois de verificar, voce precisa marcar quais eventos receber:

1. Na lista de campos, marque **Subscribe** para:
   - `messages` (DMs)
   - `messaging_postbacks` (botoes em DMs)
2. Agora no dropdown superior, mude para **"Page"**
3. Marque **Subscribe** para:
   - `feed` (comentarios em posts)

### 4E. Verificar Permissoes do App

1. No menu lateral, clique em **"App Review"** > **"Permissions and Features"**
2. Verifique que estas permissoes estao ativas:
   - `instagram_manage_messages` — **Obrigatoria**
   - `pages_messaging` — **Obrigatoria**
   - `instagram_manage_comments` — Recomendada

> **Nota**: Em modo de desenvolvimento, essas permissoes ja funcionam para administradores e usuarios de teste do app. Para producao com usuarios reais, e necessario submeter para revisao.

### Como saber se passou:

- **PASSOU**: Ao clicar "Verify and Save", aparece **checkmark verde** com "Webhook verified". Os campos `messages` e `feed` mostram "Subscribed"
- **FALHOU**: Meta mostra "Verification failed" — verifique se:
  1. O n8n esta rodando
  2. A URL e publica e acessivel via HTTPS
  3. O verify token e identico ao do `.env`

---

## PASSO 5 — Teste Controlado e Go-Live

### 5A. Testar com Webhooks Simulados

Com o n8n rodando, abra outro terminal e rode:

```bash
# Testar DM
./scripts/test-webhook.sh dm
# Esperado: {"status":"ok","reply":"..."}

# Testar Comentario
./scripts/test-webhook.sh comment
# Esperado: {"status":"ok","reply":"..."}

# Testar Novo Seguidor
./scripts/test-webhook.sh follow
# Esperado: {"status":"ok","reply":"..."}
```

### 5B. Verificar no Kommo

1. Abra o Kommo no navegador
2. Va em **Leads** > Pipeline **"SOCIAL SELLING INSTAGRAM"**
3. Deve haver leads de teste criados nos ultimos minutos
4. Clique em um lead > veja as **notas** — devem conter dados da conversa

### 5C. Verificar no n8n

1. No n8n, clique em **"Executions"** (menu lateral)
2. Deve haver 3 execucoes recentes (dm, comment, follow)
3. Todas devem estar com status **verde** (sucesso)
4. Clique em uma execucao para ver o fluxo completo

### 5D. Teste Real com Instagram

1. No n8n, **ative o workflow**: clique no toggle no canto superior direito (deve ficar verde/ativo)
2. De uma **conta de teste do Instagram** (nao a conta principal), envie uma DM para **@dr.felipefranca**
3. Observe:
   - **No n8n**: Uma nova execucao deve aparecer em "Executions" em ate 10 segundos
   - **No Kommo**: Um novo contato e lead devem ser criados
   - **No Instagram**: A conta de teste deve receber uma resposta automatica

### Checklist Final:

| Verificacao | Passou | Falhou |
|---|---|---|
| 3 testes simulados retornam `status: ok` | Os 3 retornaram JSON valido | Algum retornou erro ou nao respondeu |
| Contatos de teste criados no Kommo | Contatos aparecem com nomes corretos | Nenhum contato ou erros de API no log |
| Leads no pipeline correto | Leads nas etapas certas | Leads faltando ou em etapa errada |
| Notas de CRM | Notas com dados da conversa | Notas vazias ou ausentes |
| DM real respondida | Resposta recebida em ate 10s | Sem resposta ou execucao falhou |
| Sem erros de telemetria | Nenhuma nota "SYSTEM ERROR LOG" | Notas de erro presentes em execucoes limpas |

---

## Resumo dos Comandos

```bash
# 1. Criar .env
cp config/env.example .env
# (editar .env com suas chaves)

# 2. Criar pipeline no Kommo
npm run setup

# 3. Iniciar n8n
npm run start:n8n
# (configurar variaveis e credencial na UI do n8n)
# (importar workflow e vincular credencial)

# 4. Webhook: configurar no Meta Developer Console

# 5. Testar
./scripts/test-webhook.sh dm
./scripts/test-webhook.sh comment
./scripts/test-webhook.sh follow
```

---

> Ao completar todos os 5 passos com sucesso, o sistema esta **em producao**.
> Monitore as primeiras 24 horas: execucoes no n8n, notas no Kommo, e uso no OpenAI.
