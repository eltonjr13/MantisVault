#!/bin/bash

echo "🔧 Recompilando pacote crypto..."
cd packages/crypto
pnpm build

echo ""
echo "✅ Crypto recompilado!"
echo ""
echo "🚀 Reiniciando servidor mobile..."
cd ../../apps/mobile
pnpm dev
