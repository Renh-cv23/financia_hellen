#!/usr/bin/env python3
"""Gera a senha da sincronização e o SYNC_AUTH_HASH para a Netlify.

    python3 scripts/gerar_senha.py            # cria uma senha nova
    python3 scripts/gerar_senha.py "minha senha"   # usa a senha informada

A derivação tem de bater exatamente com js/sync.js (derivarChaves):
PBKDF2-SHA256, mesmo sal, mesmas iterações; os primeiros 32 bytes viram o
token de acesso e os 32 seguintes a chave AES — esta só existe no navegador.
"""
import hashlib
import secrets
import sys
import unicodedata

SAL = b"financia-hellen/sync/v1"
ITERACOES = 600_000
# Sem 0/o, 1/l/i: a senha vai ser digitada no celular.
ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"


def normalizar(senha: str) -> str:
    # Mesma regra do app: teclado de celular costuma pôr maiúscula sozinho.
    return unicodedata.normalize("NFC", senha.strip().lower())


def nova_senha() -> str:
    return "-".join("".join(secrets.choice(ALFABETO) for _ in range(4)) for _ in range(5))


def main() -> None:
    senha = sys.argv[1] if len(sys.argv) > 1 else nova_senha()
    senha = normalizar(senha)
    if len(senha) < 12:
        sys.exit("Senha curta demais: use pelo menos 12 caracteres.")
    bits = hashlib.pbkdf2_hmac("sha256", senha.encode(), SAL, ITERACOES, dklen=64)
    token = bits[:32].hex()
    print("Senha:          ", senha)
    print("SYNC_AUTH_HASH: ", hashlib.sha256(token.encode()).hexdigest())


if __name__ == "__main__":
    main()
