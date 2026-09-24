/* =========================================================================
   sync.mjs — guarda e devolve o backup CIFRADO do app (Netlify Blobs).

   O servidor nunca vê dado de paciente: o navegador cifra com AES-GCM usando
   uma chave derivada da senha, e aqui chega só { v, iv, ct } ilegível. Esta
   função só decide QUEM pode ler/gravar esse bloco.

   Autenticação: o app deriva da senha um token de 256 bits (PBKDF2) e o envia
   no cabeçalho Authorization. Aqui fica apenas o SHA-256 desse token, na
   variável de ambiente SYNC_AUTH_HASH — nem a senha nem o token moram no
   servidor. Como o token tem 256 bits, adivinhar por força bruta é inviável.
   ========================================================================= */
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

const CHAVE = 'dados';
const LIMITE_BYTES = 5 * 1024 * 1024;

function resposta(status, corpo) {
  return new Response(corpo == null ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function autorizado(req) {
  const esperado = (process.env.SYNC_AUTH_HASH || '').trim().toLowerCase();
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^[0-9a-f]{64}$/.test(esperado) || !token) return false;
  const recebido = createHash('sha256').update(token).digest('hex');
  return timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

export default async (req) => {
  if (!process.env.SYNC_AUTH_HASH) return resposta(503, { erro: 'SYNC_AUTH_HASH não configurada' });
  if (!autorizado(req)) return resposta(401, { erro: 'senha incorreta' });

  // Consistência forte: logo depois de gravar no celular, o notebook já lê a versão nova.
  const store = getStore({ name: 'financia', consistency: 'strong' });

  if (req.method === 'GET') {
    const dado = await store.get(CHAVE, { type: 'text' });
    if (dado == null) return resposta(404, { erro: 'nada salvo ainda' });
    return new Response(dado, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  if (req.method === 'PUT') {
    const corpo = await req.text();
    if (corpo.length > LIMITE_BYTES) return resposta(413, { erro: 'arquivo grande demais' });
    let env;
    try { env = JSON.parse(corpo); } catch (e) { env = null; }
    // Só aceita o envelope cifrado: evita que um erro no app grave dado aberto aqui.
    if (!env || env.v !== 1 || typeof env.iv !== 'string' || typeof env.ct !== 'string') {
      return resposta(400, { erro: 'formato inválido' });
    }
    await store.set(CHAVE, corpo);
    return resposta(204);
  }

  return resposta(405, { erro: 'método não suportado' });
};

export const config = { path: '/api/sync' };
